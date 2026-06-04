# BatchPlane Lite Demo Repository Skeleton

This directory is a copyable GitHub Lite target repository skeleton.

Copy the hidden `.batch-governance` and `.github` directories into a private
GitHub repository when you want to try BatchPlane Lite without first using the
Workspace installation PR flow.

```bash
cp -R examples/github-lite-demo/.batch-governance /path/to/target-repo/
cp -R examples/github-lite-demo/.github /path/to/target-repo/
```

Commit and push the copied files to the target repository default branch. Then
open the BatchPlane Lite UI, connect the repository from Workspace, and choose
Check connection.

For production-like testing, prefer the Workspace `Create installation PR`
flow. Copying this skeleton is useful for demos, but it skips the repository's
native setup pull-request review evidence.

The demo contains:

- Workspace policy with self-approval blocked by default
- repository role mapping for requester, approver, maintainer, and auditor
- dispatcher workflow for approved execution request comments
- sample target workflow installed by the Lite bootstrap flow
- one demo batch definition and generated target workflow

The demo batch is `demo.echo`. It runs only after BatchPlane Gate verifies a
matching execution request and approval evidence.
