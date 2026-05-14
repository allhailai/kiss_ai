# Maintainer Feature Ideas

This is an internal backlog for maintainers. It is not setup or usage documentation for external users. Start with [`README.md`](README.md) for the public onboarding path.

When the user first sets up the app, form to save the Cursor API key to the keychain
- Need to check that the project guards against revealing the cursor API key

Auto-pull the latest kiss_ai changes (from git) -> public project





-----------------------------------------------------
-- Small: -------------------------------------------
-----------------------------------------------------
- Revert files at a line level
- Need to add some sort of a running indicator on the Rebuild screen.
- Could we also put something in the persistent header that indicates the project is rebuilding?
-

-----------------------------------------------------
-- Large: -------------------------------------------
-----------------------------------------------------

- Curated Outputs
  - Webpages
  - PDFs
  - PPT

- AnnotationFlow: Gitflow
  - Requirement files & all other files are annotations only
    - annotations can be scoped by the user to specific things
    - Can queue annotations so that teams can work together
      - Annotations are FIFO -> agent -> modify files
      - Annotations are just FIFO applied to the scope (default:all)
      - Agents can synthesize (merge them) annotation into scoped contexts

- Goals, Inputs, Outputs => JSON:Topics+Concepts
  - Allows apply all or to a specific

----------
Fun ------
----------
- Soul file
