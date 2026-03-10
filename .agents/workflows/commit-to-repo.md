---
description: Build for production, patch endpoints, and commit to the repository.
---

1. Validate that all changes are ready for production.

// turbo
2. Run the production preparation script to patch extension endpoints:
```bash
node web/scripts/prepare-production.js
```

3. Ensure no secrets are staged (the script only patches endpoints, but double-check .env.local isn't tracked).

// turbo
4. Commit and push the changes:
```bash
git add .
git commit -m "chore: prepare for production deployment and patch endpoints"
git push origin main
```

5. Confirm that the production build is now live on the repository.
