# User study plan: commit by hand, and merge by kind

Status: plan only. Nobody has been recruited. No session has been run. This file reports no results.

The paper's Section 6 sketches a later study with BlobFS in 3D, BlobFS in 2D, and a folder window, for 12 to 16 people. There is no 3D prototype, so that sketch cannot be run as written. This plan is the study that can be run on `blobfs-2d.html`. It does not replace a future 3D comparison, and it does not claim one.

The question is the human commit gate and merge-by-kind on the 2D page, compared with an ordinary folder window. A second BlobFS condition with the kind gate turned off would isolate the gate from the spatial canvas. The page has no such switch. This plan does not pretend that it does.

## Research questions

1. On the 2D page, what do people do with a cross-kind suggestion (accept, keep apart, or leave it), and how often do they undo a same-kind merge that committed on the drop?
2. Compared with a folder window on matched files, does the 2D page change organization time, later retrieval failures, and rated workload?
3. After a short practice, can a participant say which drops commit immediately and which ones wait for Accept?

## Hypotheses

These are stated before any data exist. They are not findings.

- H1. In the BlobFS condition, undone same-kind merges (committed on drop or by the merge command, `confirmedBy` `human-drop` or `human-command`) outnumber undone cross-kind merges (committed only after Accept, `confirmedBy` `human-accept`). The gate is what makes the cross-kind path confirm first.
- H2. Raw NASA-TLX effort is higher for the BlobFS page than for the folder window. Folder literature already points that way. A lower BlobFS score would be a surprise, not the prediction.
- H3. There is no prediction that BlobFS retrieval is faster or more accurate than folders. Retrieval is measured so a later paper cannot quietly drop it.

KondoCloud's published 25.5% acceptance of suggestions is a comparison point for the accept rate defined below. It is not a control group in this study.

## Participants

Target 16, with a floor of 12 and a ceiling of 20. Each person does both conditions, so the comparison is within subjects. Stop at 16 unless replacements are needed for no-shows who never started. Do not add people after looking at outcomes.

Recruitment: adults, via a university mailing list and personal contacts, in Finland. Do not recruit anyone whose grade or job the author controls. The author is not a participant. Pilot participants are not in the 16.

Inclusion: age 18 or over; uses a desktop or laptop computer at least weekly; can read the task sheet in English; can use a mouse or trackpad for the session.

Exclusion: took part in the pilot; cannot attend the next-day retrieval; wants to use their own files (the file set is synthetic, and personal files are out of scope).

## Design

Within subjects. Two conditions, order counterbalanced: half do BlobFS then folders, half do folders then BlobFS. Assignment is by a shuffled list made before the first session, not by who shows up looking which way.

Two matched file sets, Red and Blue. 48 files each, built for the study and not taken from anyone's disk:

- 16 images, 12 audio, 12 text, 4 zip files, and 4 folders that already hold a few of those files
- names that describe the contents (`harbor-take.wav`, `march-invoice.txt`), so a later retrieval prompt can avoid saying the filename
- kinds and folder shapes matched across sets (same counts, different names)
- no personal data, no real photos of people

Each person organizes one set in each condition. Which set goes with which condition alternates with the order list, so set and order are not locked together.

Condition G, the gate. Open `blobfs-2d.html?study=1` from a local `file://` URL (or `blobfs-2d.html#study` if a browser drops the query on a file URL). The kind gate stays on: a same-kind drop commits; a cross-kind drop with a shared tag becomes a suggestion; a cross-kind drop with no shared tag bounces. Physics may propose a suggestion and cannot commit it. Study mode is logging only. It does not change those rules.

Condition F, folders. The same laptop's ordinary file manager (record which one: the study machine's GNOME Files, or Finder if the laptop is macOS). One directory of the same 48 files. No BlobFS page. The facilitator times this condition with a stopwatch, because the file manager does not write a BlobFS log.

What this does not separate: the folder condition differs in layout, in commands, and in the gate, all at once. A gate-off BlobFS arm is the comparison that would isolate the gate. It is not in the build, so it is not a condition here.

## Tasks

Practice, not scored: 3 minutes on the sample disk in the BlobFS condition, and 1 minute creating and renaming a folder in the file manager. Tell the person that same-kind drops commit and cross-kind drops wait. That sentence is part of the script, so the study is not a trick.

Organize, day 1, cap 12 minutes. "Arrange these files in whatever way you would want to find them later. You may merge, tag, rename, undo, or make folders. Stop when you are satisfied, or at 12 minutes." They must not import files from outside the set.

Retrieve, day 2, 20 to 28 hours later. 15 short descriptions per set, written in advance and not the filenames ("the recording from the harbor"). One file is the intended hit for each description; the answer key stays with the facilitator. Cap 45 seconds per item, then mark it missed. The person may use only the condition they organized that set in. They may not reorganize during retrieval. The facilitator reads the prompt and starts the item timer; the page does not time items.

SUS after each condition on day 1 (the 10-item System Usability Scale). Raw NASA-TLX after each condition on day 1 (six subscales, unweighted). A 10-minute interview after the day-2 retrieval, both conditions already experienced. Interview prompts: when did something merge that you did not mean; when did you refuse a suggestion; what was harder than folders; what was easier. No other questionnaires.

## Measures

Define these before looking at anyone's log.

- Organize time: facilitator stopwatch, from the word "start" to the word "done" or the 12-minute cap. The page does not mark task boundaries.
- Retrieval: per item, seconds until the person names a file, or 45 if they miss. An error is a wrong file or a miss. The primary retrieval number is the count of errors out of 15, per condition.
- Unwanted merge: a merge the person undoes, or names as a mistake in the interview. A researcher does not score a merge as unwanted only because they dislike it. Undo is counted from the log. Interview mentions are coded from the notes against the log, and a mention with no matching undo is reported separately, not folded into the undo count.
- Undo use: number of `undo` events in the BlobFS log during the organize task. The folder condition has no equivalent event; the facilitator counts Cmd/Ctrl-Z only if they are watching, and that count is secondary and labeled as observed, not logged.
- Suggestion fate, BlobFS only. A `suggest` event is one suggestion. An accept is a later `merge` with `confirmedBy` `human-accept` for that pair. A refusal is a `refuse` event. A `suggest-dismiss` event is a physics suggestion that expired because the orbs moved apart. Accept rate = accepts / (accepts + refuses + dismissals). Suggestions still pending at export sit in a fourth bin, "left open", and are not in the denominator.
- Same-kind commits: `merge` events with `rule` not crossing kinds and `confirmedBy` of `human-drop` or `human-command`. Cross-kind commits: `merge` events with `confirmedBy` `human-accept`. H1 compares how many of each were undone.
- SUS score per condition, standard 0–100 conversion. Raw TLX: mean of the six subscales, and the six numbers kept.
- Interview: coded for the three prompts above. Quotes are used only with the consent form's quote permission.

## Instrumentation that already exists

The page keeps an append-only event log on the machine. Nothing in the page sends that log anywhere. Opens, plays, and exports are local use-log events (`local: true`). `export history` downloads `blobfs-history.txt`. Save writes `demo.orb.zip` locally.

Events the page already writes in normal use, study mode or not:

- `merge`, with `rule` (`dir+dir`, `file+file`, `file+dir`), `confirmedBy` (`human-drop`, `human-command`, `human-accept`), and the two kinds
- `refuse`, when the person keeps a suggestion apart
- `undo`, which appends a new event and does not delete the merge
- `create`, `split`, and the local `open`, `play`, and `export` events

Physics calls the suggestion path and does not call `merge`. A merge with `confirmedBy` `physics` is refused by the code.

## Logging added for this plan

Study mode is off unless the page is opened with `?study=1`, with `#study`, or with `window.__BLOBFS_STUDY` set to `1` before load. It does not change merge rules. When it is on, the page:

- puts `study: true` and a random 8-hex `session` on each event
- shows that session in the status line, with the sentence that history stays on this machine
- logs a `suggest` event (source `physics`, `drop`, or `command`, plus `crossKind` and `shared` tags)
- logs a `bounce` event when different kinds share no tag
- logs a `suggest-dismiss` event when a physics suggestion expires because the orbs separated
- writes the session id and "This file stays on this machine. It has no participant name." at the top of `blobfs-history.txt`

The participant does not type their name into the page. The facilitator keeps a paper key from participant code (`P01`) to session id, separate from the log file.

Still not logged, and not to be faked from the event file:

- organize and retrieval times (stopwatch sheet)
- SUS and NASA-TLX (paper forms)
- the interview (notes, or an audio recording only if they agree)
- anything the person does in the folder condition

Do not point the study at the GitHub Pages copy. Use a local file so the session is the build you recorded, and so the log is not a page that later changes underneath the study.

## Analysis

Primary test, one of them: for each BlobFS session, (undone same-kind merges) minus (undone cross-kind accepts). Wilcoxon signed-rank against zero, two-sided, alpha 0.05. Report the median of that difference and a confidence interval. n is 16, times will skew, so the paired tests below are Wilcoxon too, not a t-test.

Secondary, each reported whether or not it is significant: organize time, BlobFS versus folders; retrieval errors, BlobFS versus folders; SUS; raw TLX effort. These do not change the primary test.

Accept rate is descriptive. Put KondoCloud's 25.5% next to it as a published number, not as this study's result.

Day-2 absence: keep the day-1 organize measures; mark retrieval missing. Do not impute it.

No second primary outcome gets chosen after the sessions. Pilot numbers are not pooled with the 16.

## Ethics and consent

The author is in Finland, so the General Data Protection Regulation applies to this study when he is the controller. This plan is not legal advice. A university ethics review, where the host requires one, happens before recruitment. Do not recruit while that review is open.

Consent is on paper, before practice. The sheet says: what the two sessions are, that they can stop, that stopping deletes their log and their row on the key, that the files are synthetic, and that they must not drag in their own files. It asks separately for: the session log, the questionnaire, interview notes, and optional audio of the interview. No camera. No deception.

Personal data: the name on the consent form; the paper key; optional interview audio; the log, which contains synthetic filenames and a random session id, not the person's name. Lawful basis for this small voluntary study: consent, GDPR Article 6(1)(a).

The key and the consent forms stay in a locked drawer or an encrypted disk, not in the same folder as the logs. After analysis the key is destroyed, which leaves the logs without a name. Say that on the consent form, including that aggregate counts may remain. Retention: five years, or shorter if the host's rule is shorter, then delete. Audio, if any, is deleted after the notes are checked against it, unless they agreed to keep the recording.

No cloud upload of logs, forms, or audio. The study laptop is encrypted. Nothing in the plan sends data outside the EEA.

Participants are 18 or over. There is no clinical intervention. The main burden is about an hour across two days.

## Timeline

Dates are not booked. The order is fixed.

1. Ethics review, if the host requires it. Recruitment waits.
2. Build the two file sets and the answer keys. Print the script, SUS, TLX, and stopwatch sheet.
3. Pilot, below.
4. Sixteen people, day 1 then day 2 inside 20–28 hours. One person at a time. One laptop.
5. Analysis only after the last day-2 visit that is going to happen. Write results only from that analysis. This document stays a plan.

## Pilot

Two adults who meet the inclusion rules and will not be in the 16. They do the full protocol, including day 2.

Check, and write down what you change:

- the script fits in the caps (3 minutes practice, 12 minutes organize, 45 seconds per retrieval)
- `blobfs-history.txt` from study mode contains the session line, at least the practice `suggest` or `bounce` lines if they occurred, and no person name
- the stopwatch sheet has a place for condition, set, order, and both times
- the participant can explain, in their own words, that a same-kind drop commits and a cross-kind drop waits

If the script changes after the pilot, the 16 use the changed script. Pilot logs are kept only as a methods note, labeled pilot, and are not entered into the Wilcoxon tests.
