"""One bounded, non-retrying call to the fixed Micu destination. RAM-only key."""
import http.client
import json
import time
import sys
import agent_runtime
from agent_contract import validate_result,request_messages,ContractError
from agent_errors import ProviderError

def run_provider(data,key,model,user_agent,connection_factory=http.client.HTTPSConnection):
    messages=request_messages(data)
    body=json.dumps({'model':model,'messages':messages,'temperature':.1,'response_format':{'type':'json_object'},'max_tokens':1000,'thinking':{'type':'disabled'},'stream':False},ensure_ascii=False).encode()
    conn=connection_factory('www.micuapi.ai',timeout=30)
    diagnostic={'requested_model':model,'returned_model':None,'upstream_status':None,'usage':{},'cost':None,'completed':False,'error':None,'protocol_stage':'request','schema_error':None}
    started=time.monotonic()
    try:
        conn.request('POST','/v1/chat/completions',body,{'Content-Type':'application/json','Authorization':'Bearer '+key,'User-Agent':user_agent})
        response=conn.getresponse();diagnostic['upstream_status']=response.status
        raw=response.read(65537)
        if response.status!=200:
            error={401:('invalid_key','密钥无效或已失效，请重新配置。'),403:('model_forbidden','该密钥无权访问此模型。'),429:('rate_limited','模型暂时限流，请稍后重试。')}.get(response.status,('provider_error','模型服务暂不可用，请稍后重试。'))
            raise ProviderError(*error)
        if len(raw)>65536:raise ProviderError('response_too_large','模型回复过长，请缩短问题。')
        diagnostic['protocol_stage']='envelope_json'
        envelope=json.loads(raw)
        usage=envelope.get('usage',{})
        if isinstance(usage,dict):diagnostic['usage']={k:v for k,v in usage.items() if k in {'prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens'} and type(v) is int and 0<=v<=100000000}
        returned=envelope.get('model')
        if isinstance(returned,str) and returned.startswith('deepseek') and len(returned)<100:diagnostic['returned_model']=returned.replace(key,'[已隐藏]')
        choices=envelope.get('choices') or []
        if not choices or choices[0].get('finish_reason') != 'stop':raise ProviderError('incomplete_response','模型回复未完成，请重新发送。')
        diagnostic['protocol_stage']='content'
        text=choices[0].get('message',{}).get('content')
        if not isinstance(text,str):raise ProviderError('invalid_contract','模型未返回可验证的安排。')
        text=text.replace(key,'[已隐藏]').strip()
        if text.startswith('```'):text=text.split('\n',1)[-1].rsplit('```',1)[0].strip()
        diagnostic['protocol_stage']='result_json'
        parsed=json.loads(text)
        diagnostic['protocol_stage']='contract'
        result=validate_result(parsed);diagnostic['completed']=True;diagnostic['protocol_stage']='complete'
        return result,diagnostic
    except ProviderError as error:
        diagnostic['error']=error.code;error.diagnostic=diagnostic;raise
    except (TimeoutError,ConnectionError,OSError) as error:
        diagnostic['error']='timeout' if isinstance(error,TimeoutError) else 'network_error'
        safe=ProviderError(diagnostic['error'],'连接超时或服务异常，未创建新任务。',504 if isinstance(error,TimeoutError) else 502);safe.diagnostic=diagnostic;raise safe from None
    except ContractError as error:
        # These are our fixed schema error labels, never upstream prose/content.
        diagnostic['schema_error']=str(error)
        diagnostic['error']='invalid_contract';safe=ProviderError('invalid_contract','模型回复格式未通过校验，请重试。这次没有执行操作。');safe.diagnostic=diagnostic;raise safe from None
    except (ValueError,KeyError,TypeError,IndexError,AttributeError):
        diagnostic['schema_error']='invalid_json_or_envelope'
        diagnostic['error']='invalid_contract';safe=ProviderError('invalid_contract','模型回复格式未通过校验，请重试。这次没有执行操作。');safe.diagnostic=diagnostic;raise safe from None
    finally:
        diagnostic['elapsed_ms']=round((time.monotonic()-started)*1000);conn.close();key=None

# The existing server reloads this fixed module on normal agent requests.
# Adopt the new request policy without restarting or moving RAM credentials.
agent_runtime.install_existing_service(sys.modules.get('__main__'))
