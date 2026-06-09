## Summary

- 

## Contribution Type

- [ ] Bug fix
- [ ] Feature or workflow improvement
- [ ] Documentation
- [ ] Portable build, release, or updater change
- [ ] Refactor or maintenance

## Contributor Checklist

- [ ] I branched from `master` and this PR targets `master`.
- [ ] I kept the change focused and avoided unrelated formatting/refactors.
- [ ] I read `CONTRIBUTING.md`.
- [ ] For component/UI work, I followed BEM, ComponentFactory, icon, DOM helper,
      event cleanup, and CSS-token rules.
- [ ] For ComfyUI work, workflow injection targets `_meta.title`, not numeric
      node IDs.
- [ ] For project JSON writes, backend changes use the queued atomic project
      write path.

## Release or Portable Impact

If this PR affects portable artifacts, release copy, updater behavior, platform
validation, or public contribution surfaces, fill this in:

- Artifact name(s):
- Platform and OS version:
- CPU architecture:
- GPU and driver stack:
- Clean install or update path tested:
- Launcher result:
- Engine setup or repair result:
- Generation result, if hardware allowed:
- App log tail:

## Release Copy Gate

- [ ] Platform support language matches the recorded validation evidence.
- [ ] Windows claims are limited to local maintainer testing unless a separate clean host was validated.
- [ ] Linux claims are limited to install/launch validation on weak Ubuntu hardware unless generation was validated elsewhere.
- [ ] macOS is marked maintainer-untested unless community or maintainer validation is recorded.
- [ ] Vision copy stays scoped to local image and video generation.

## Checks

- [ ] Targeted tests or manual validation are listed in the PR.
- [ ] No unrelated files were reformatted or refactored.
- [ ] Documentation was updated when behavior, setup, or contributor workflow changed.
