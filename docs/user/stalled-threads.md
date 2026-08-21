# When a thread stops responding

A thread that is mid-turn shows **Working**. If the agent goes silent — no output of any
kind, not even thinking — for two minutes, T3 Code shows **Stalled** instead and writes a
line into the thread saying how long it has been quiet. If the silence reaches five
minutes, the turn is ended and the thread says so. Send the message again to pick it up.

Silence only counts when the agent should be producing something. A running command, a
context compaction, a question waiting on your answer, and background work all keep a
thread healthy for as long as they take, however quiet they are.

You never have to wait for either timer. **Stop** ends the turn immediately, and
**Reset session** in the thread's menu clears a thread that will not respond to anything
else.

## Threads that were left running

If the server was restarted, quit, or crashed while a turn was in flight, that turn has no
process left to finish it. T3 Code notices those threads on its own — within a couple of
minutes — closes out the turn, and lets the thread settle. You do not need to do anything;
send the message again when you are ready.

Both behaviors work the same on web, desktop, and mobile, and over remote connections.
