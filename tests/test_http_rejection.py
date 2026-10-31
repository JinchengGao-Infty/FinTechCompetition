import http.client
import importlib.util
import io
import json
import socket
import threading
import time
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import Mock, patch

spec=importlib.util.spec_from_file_location('rejection_test_server',Path(__file__).parents[1]/'server.py')
app=importlib.util.module_from_spec(spec);spec.loader.exec_module(app)

class RejectionTests(unittest.TestCase):
    def fixture(self,body=b'abcd',size='4'):
        handler=object.__new__(app.Handler)
        handler.command='POST';handler.headers=Message();handler.headers['Content-Length']=size
        handler.connection=Mock();handler.connection.gettimeout.return_value=None
        handler.rfile=Mock(wraps=io.BytesIO(body))
        return handler

    def test_discard_is_bounded_and_does_not_parse_or_overread(self):
        handler=self.fixture(b'abcdNEXT')
        handler.discard_rejected_body()
        self.assertEqual(handler._body_bytes_read,4)
        self.assertEqual(handler.rfile.read(),b'NEXT')
        handler.connection.settimeout.assert_called_with(None)

    def test_ambiguous_large_and_already_consumed_bodies_are_not_read_again(self):
        for size,consumed,chunked in [('65537',0,False),('4',4,False),('4',0,True),('bad',0,False)]:
            handler=self.fixture(size=size);handler._body_bytes_read=consumed
            if chunked:handler.headers['Transfer-Encoding']='chunked'
            handler.discard_rejected_body();handler.rfile.read1.assert_not_called()
        handler=self.fixture();handler.headers['Content-Length']='4'
        handler.discard_rejected_body();handler.rfile.read1.assert_not_called()

    def test_total_deadline_does_not_restart_for_each_chunk(self):
        handler=self.fixture();handler.rfile.read1.side_effect=[b'a',b'b']
        with patch.object(app.time,'monotonic',side_effect=[0,.1,.3]):
            handler.discard_rejected_body()
        self.assertEqual(handler.rfile.read1.call_count,1)
        self.assertEqual(handler._body_bytes_read,1)

    def test_malformed_json_is_accounted_before_parse_failure(self):
        handler=self.fixture(b'oops')
        with self.assertRaises(ValueError):handler.payload()
        self.assertEqual(handler._body_bytes_read,4)
        handler.discard_rejected_body();handler.rfile.read1.assert_not_called()

    def test_split_body_rejections_return_json_and_never_reach_upstream_or_queue(self):
        server=app.FinPilotHTTPServer(('127.0.0.1',0),app.Handler);app.PORT=server.server_port
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        upstream=Mock(side_effect=AssertionError('must not reach upstream'))
        try:
            conn=http.client.HTTPConnection('127.0.0.1',app.PORT,timeout=1)
            conn.request('GET','/api/session');reply=conn.getresponse()
            cookie=reply.getheader('Set-Cookie').split(';')[0];csrf=json.loads(reply.read())['csrf'];conn.close()
            with patch.object(app,'_VOICE_CONNECTION_FACTORY',upstream),patch.object(app.demo_events.QUEUE,'publish') as publish:
                for route,status in [('/api/voice/tts',400),('/api/demo/events',403)]:
                    for invalid in ['Origin','X-CSRF-Token']:
                        headers={'Host':f'127.0.0.1:{app.PORT}','Origin':f'http://127.0.0.1:{app.PORT}','Cookie':cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'}
                        headers[invalid]='https://untrusted.invalid' if invalid=='Origin' else 'invalid'
                        body=b'{"speak":"synthetic"}';headers['Content-Length']=str(len(body))
                        sock=socket.create_connection(('127.0.0.1',app.PORT),timeout=1)
                        try:
                            request=f'POST {route} HTTP/1.1\r\n'+''.join(f'{k}: {v}\r\n' for k,v in headers.items())+'\r\n'
                            sock.sendall(request.encode());time.sleep(.05);sock.sendall(body)
                            response=http.client.HTTPResponse(sock);response.begin()
                            self.assertEqual(response.status,status)
                            self.assertEqual(response.getheader('Connection'),'close')
                            self.assertIsInstance(json.loads(response.read()),dict)
                        finally:sock.close()
                upstream.assert_not_called();publish.assert_not_called()
        finally:server.shutdown();server.server_close();thread.join(1)
