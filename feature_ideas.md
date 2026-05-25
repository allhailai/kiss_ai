# Maintainer Feature Ideas

- AI Agent -> create an artifact from the conversation


1. Agent indicates that the current artifact spec might need changes
2. Fix the chat user input buttons taking up more than 1 line.


This is an internal backlog for maintainers. It is not setup or usage documentation for external users. Start with [`README.md`](README.md) for the public onboarding path.

- Need the agent proposed conceptual diffs to have Apply Proposal button in the chat area not beneath the conceptual diffs - easy to not see / miss that button
- The propose edits... needs to not activate when user Asks & vice versa.. currently both buttons look like they are active




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
  - ~~Webpages~~ ✅ Shipped — artifacts feature
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
