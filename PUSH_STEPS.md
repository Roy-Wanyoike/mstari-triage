# Push to GitHub and submit

The repo is initialized with one clean commit dated during the submission
period (that is the "new work" evidence). Push it as a **new public
repository** under your account.

```bash
cd mstari-triage

# Option A - GitHub CLI (fastest)
gh repo create mstari-triage --public --source=. --push

# Option B - plain git (create the empty repo on github.com first)
git remote add origin https://github.com/godfrey-creat/mstari-triage.git
git push -u origin main
```

Then finish the submission checklist:

1. [ ] Repo public, MIT licence visible (LICENSE).
2. [ ] Record the demo video per VIDEO_SCRIPT.md — ONE unedited take,
       tool calls visible, < 3 minutes, upload to YouTube/Vimeo, add the URL
       to VIDEO_SCRIPT.md (DEMO_VIDEO_URL) and commit that change.
3. [ ] Submit on the challenge form with the ~300-word description from
       SUBMISSION.md.
4. [ ] Before the deadline: judges clone at deadline; do NOT force-push or
       amend after submitting.

## Optional (recommended): prove the open-weights lane on camera

```bash
ollama pull qwen2.5:7b
./run_demo.sh "Sr. A. Wanjiru (Triage Nurse)"
```

run_demo.sh auto-detects Ollama and prints the open-weights lane banner.
Without Ollama the repo still runs end-to-end in labelled heuristic mode.

## Notes

- `python -m mstari.main evals` must show 15/15 (+ F1 known failure) — that is
  your EVALS.md evidence, reproducible by judges.
- Do not commit a real .env or any real patient data. Ever.
