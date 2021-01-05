module.exports = {
  publicPath: '/_admin',
  pages: {
    index: {
      // entry for the page
      entry: 'frontend/index.js',
      // the source template
      template: 'frontend/index.html',
      // output as dist/index.html
      filename: 'index.html',
      // chunks to include on this page, by default includes
      // extracted common chunks and vendor chunks.
      chunks: ['chunk-vendors', 'chunk-common', 'index']
    },
    public: {
      entry: 'frontend/public.js',
      template: 'frontend/public.html',
      filename: 'public.html',
      chunks: ['chunk-vendors', 'chunk-common', 'public']
    },
    protected: {
      entry: 'frontend/protected.js',
      template: 'frontend/protected.html',
      filename: 'protected.html',
      chunks: ['chunk-vendors', 'chunk-common', 'protected']
    }
  }
};
