# MiniMax integration handoff
Core owns server.py, minimax_session.py, web/minimax-settings.mjs and app settings integration. Voice worker owns independent provider and streaming browser adapter.

GET /api/voice/config returns public status only. POST same route requires existing Origin+session+CSRF, exact {key,consent:true} or {disconnect:true}. RAM session fields: minimax_key, minimax_generation (changes on reconnect/disconnect), minimax_verified, minimax_characters. Existing LLM key and TTL untouched. Fixed speech-2.8-hd / Chinese (Mandarin)_Warm_Bestie. Limit 2000 estimated billing characters per local session; reconnect must not reset usage. No provider IO on configure.

Voice worker: please export server-side stream adapter accepting key+speak and cancellation, never logging/key echo; browser adapter should expose fixed short sample playback using same streaming path. Core will own routes /api/voice/minimax/stream and status selection. Do not edit core files. Stream must recheck generation/expiry before audio output, stop on disconnect, reserve estimate before provider call. No silent fallback. Await final agreed adapter API before wiring.
