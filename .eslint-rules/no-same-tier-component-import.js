module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow same-tier component imports; cross-tier only',
      category: 'Best Practices',
    },
  },
  create(context) {
    const filename = context.filename;
    const compounds = filename.includes('/Compounds/');
    const organisms = filename.includes('/Organisms/');

    if (!compounds && !organisms) {
      return {};
    }

    const forbiddenTier = compounds ? '/Compounds/' : '/Organisms/';

    return {
      ImportDeclaration(node) {
        const source = node.source.value;

        if (source.includes(forbiddenTier)) {
          context.report({
            node,
            message: `Components in ${forbiddenTier.slice(1, -1)} should not import from the same tier. Use cross-tier imports only.`,
          });
        }
      },
    };
  },
};
