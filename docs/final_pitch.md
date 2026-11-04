ScheduleSolve-AI: Written entirely during the Meta AI Hackathon, October 27th to November 4th.

Consider a student — call her Sarah. A single colliding course can block her capstone, add a semester of tuition, and delay her graduation by a full year.

Now step into the registrar's chair: you are building the operational heartbeat of a university — at full scale, managing hundreds of faculty with strict load requirements, thousands of students, and rooms scattered across a campus you cannot cross in ten minutes.

Universities still attempt to solve this NP-hard puzzle with spreadsheets and email chains. When faculty leave, facilities close, or enrollment surges, manual schedules collapse. That is why we built ScheduleSolve AI — pairing deterministic math with AI to keep every plan provable, flexible, and audit-ready.

Phase One: Point it at campus files in any format — PDF catalogs, Word degree maps, Excel room sheets, plus student records, faculty loads and cohort lists. Meta's Muse Spark autocleans, organizes, flags, and helps resolve contradictory data, reporting exactly which required inputs are missing before solver execution.

Phase Two: A professor adds constraints in plain language: "I have childcare on Mondays. A 3-hour class block works better for me. CS241 is my preference..." Muse Spark transforms these requests into schema-validated operations applied directly to the academic term.

Phase Three: Muse Spark proposes; deterministic solvers prove. Our native C++ C-Solve engine — written during the hackathon — races Google OR-Tools CP-SAT on identical data: same proven optimum, ours faster. At 361 sections CP-SAT reports unknown; ours proves it in 5.8 seconds.

Phase Four: Reality breaks mid-term: Professor Chen can no longer teach. The solver instantly calculates a replacement scenario, suggesting only faculty members it has mathematically proven can cover the load without cascading conflicts.

Phase Five: When a schedule request is mathematically impossible, the solver isolates the minimal conflict core. Muse Spark translates it into plain English and ranks repair options in human-in-the-loop advisory mode — backed by an autonomous multi-step agent (parse, validate, solve, isolate, explain, verify, auto-apply, audit) with a trace log naming every actor.

Phase Six: A student uploads a transcript, selects a degree, and specifies: "I work Tuesdays and Thursdays. Help me choose my classes." ScheduleSolve AI delivers a verified plan along with a projected graduation date. If student records and cohort lookups conflict, the student retains final control. Integrated Muse Voice Transcribe automatically drafts voice notes for advisor review.

Every stakeholder gets tailored access: instructors see only their assigned sections, while students see their cohort's required courses. Meta Muse Spark remains on standby to explain downstream impacts and advise on trade-offs.


We verified these structured workflows on open-weight Muse Spark Open served via Baseten — achieving 18 out of 18 successful live calls with structured outputs and low latency. This allows universities to self-host for strict on-premises data privacy through simple configuration changes.

ScheduleSolve AI — ensuring no student loses a year to a spreadsheet again. Thank you.