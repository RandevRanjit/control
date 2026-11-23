# Voice input

Transcription edits a composer draft. It does not submit an agent turn. Audio is
temporary client input, and only normal message submission sends the resulting
text. The phone transcribes on the device. Web and desktop transcribe in the
primary environment, the Mac whose screen they're usually on, whichever environment
the chat is in.

The [server side](../../apps/server/src/voice/VoiceInput.ts) starts a process for each
recording and keeps nothing between them. A crash in the native engine ends that process
rather than the server, and the model's memory is held only while it works. Whisper invents
words when it hears silence, "Thank you." or its last sentence again, so it is given only the
parts a speech detector keeps. The engine is an optional dependency for Apple silicon;
anywhere else the model reports itself unsupported and clients offer nothing.

Control's main window is the only page that gets the microphone. macOS grants it to the app
as a whole, so [the desktop](../../apps/desktop/src/permissions/MicrophoneAccess.ts) refuses
it to frames inside that window, such as an MCP app, and browser tabs never had it.

The [shared controller](../../packages/client-runtime/src/voice-input/controller.ts)
owns the operation while the client supplies capture and transcription. Preparation
binds the transcriber and resolved locale for the whole recording. Draft ownership,
text, and revision are captured before recording and checked before insertion, so
a late transcript cannot overwrite a draft that was edited or replaced.

Cancellation invalidates a result immediately, but resources stay owned until the
underlying work settles. Apple's native transcription call cannot be interrupted
once started. Releasing the session or deleting its recording when the abort signal
fires would race that work. The [transcription contract](../../packages/client-runtime/src/voice-input/transcription.ts)
therefore requires implementations to settle only after their work has stopped;
the [Apple binding](../../apps/mobile/src/native/voiceTranscription.ios.ts) checks
cancellation between native calls and discards late results.
