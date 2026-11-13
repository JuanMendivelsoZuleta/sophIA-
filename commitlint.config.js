/** Commits convencionales (context.md, sección 2.1). */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "docs", "test", "refactor", "perf", "build", "ci", "chore", "revert"]],
    // Se permiten mensajes en español con mayúsculas iniciales o nombres propios.
    "subject-case": [0],
  },
};
