module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow hardcoded hex colors; use CSS variables',
      category: 'Best Practices',
    },
  },
  create(context) {
    const HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}/;

    return {
      Literal(node) {
        // Only check string literals
        if (typeof node.value !== 'string') {
          return;
        }

        // Skip if in a comment (ESLint doesn't expose comment content to Literal nodes)
        if (HEX_COLOR_REGEX.test(node.value)) {
          context.report({
            node,
            message: "Use CSS variables from 'styles/01_base.css' instead of hardcoded hex colors",
          });
        }
      },
    };
  },
};
