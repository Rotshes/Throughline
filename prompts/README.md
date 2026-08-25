One file per model call, versioned like code.

- `analysis.md` — stage 1, path A. Input: played games only. Output: 0-4 motifs.
  **MUST NOT receive the candidate set.**
- `preferences.md` — stage 1, path B. Input: answers to the fixed preference
  questions. Output: 0-4 motifs, same schema as analysis.
- `matching.md` — stage 3. Input: motifs + candidate set. Output: one title
  and a rationale. Must not know which path produced the motifs.

Changing a prompt changes what the software does. It goes through the same
review as a code change and belongs in a turn record.
