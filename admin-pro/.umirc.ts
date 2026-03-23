import { defineConfig } from '@umijs/max';

export default defineConfig({
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: {
    title: '抖音评论后台',
    locale: false,
  },
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:3000',
      changeOrigin: true,
    },
  },
  routes: [
    {
      path: '/user',
      layout: false,
      routes: [
        {
          name: '登录',
          path: '/user/login',
          component: './User/Login',
        },
      ],
    },
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      name: '首页概览',
      path: '/dashboard',
      icon: 'DashboardOutlined',
      access: 'canSeeAdmin',
      component: './Dashboard',
    },
    {
      name: '平台管理',
      path: '/platforms',
      icon: 'AppstoreOutlined',
      access: 'canSeeAdmin',
      component: './Platforms',
    },
    {
      name: '评论管理',
      path: '/comments',
      icon: 'MessageOutlined',
      access: 'canSeeAdmin',
      component: './Comments',
    },
    {
      name: '申诉管理',
      path: '/appeals',
      icon: 'FileTextOutlined',
      access: 'canSeeAdmin',
      component: './Appeals',
    },
    {
      name: '提示词管理',
      path: '/prompts',
      icon: 'ProfileOutlined',
      access: 'canSeeAdmin',
      component: './Prompts',
    },
    {
      name: '账号管理',
      path: '/account',
      icon: 'UserOutlined',
      access: 'canSeeAdmin',
      component: './Account',
    },
    {
      name: 'AI 配置',
      path: '/settings',
      icon: 'SettingOutlined',
      access: 'canSeeAdmin',
      component: './Settings',
    },
    {
      path: '*',
      redirect: '/dashboard',
    },
  ],
  npmClient: 'npm',
});
