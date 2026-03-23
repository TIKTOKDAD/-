const path = require('node:path');

process.env.PATH = `${path.resolve('D:/tik')};${process.env.PATH}`;

const create = require('C:/Users/Omar/AppData/Local/npm-cache/_npx/2c52c20452535a0f/node_modules/create-umi/dist/index.js').default;

create({
  cwd: 'D:/tik',
  args: { _: ['admin-pro'], default: true, git: false },
  defaultData: {
    pluginName: 'umi-plugin-demo',
    email: 'i@domain.com',
    author: 'codex',
    version: '4.6.34',
    npmClient: 'npm',
    registry: 'https://registry.npmjs.org/',
    withHusky: false,
    extraNpmrc: '',
    appTemplate: 'max'
  }
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
