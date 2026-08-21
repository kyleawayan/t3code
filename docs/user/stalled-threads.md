# When a thread stops responding

A thread that is mid-turn shows **Working**. If the agent goes silent — no output of any
kind, not even thinking — for several minutes, T3 Code stops showing Working and shows
**Stalled** instead, and writes a line into the thread saying how long it has been quiet.

Stalled is a warning, not a verdict. A turn can legitimately go quiet inside one long
command, so T3 Code never cancels a stalled turn on your behalf. When you decide it is
stuck, press **Stop**: that ends the turn and hands the thread back to you, even if the
agent is wedged and never answers.

## Threads that were left running

If the server was restarted, quit, or crashed while a turn was in flight, that turn has no
process left to finish it. T3 Code notices those threads on its own — within a couple of
minutes — closes out the turn, and lets the thread settle. You do not need to do anything;
send the message again when you are ready.

Both behaviors work the same on web, desktop, and mobile, and over remote connections.
