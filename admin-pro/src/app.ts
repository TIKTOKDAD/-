import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history } from '@umijs/max';

import { fetchSession } from '@/services/admin';

const loginPath = '/user/login';

export async function getInitialState() {
  try {
    const session = await fetchSession();

    return {
      currentUser: session.authenticated ? session.admin : undefined,
    };
  } catch {
    return {
      currentUser: undefined,
    };
  }
}

export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    title: '抖音评论后台',
    menu: {
      locale: false,
    },
    layout: 'mix',
    splitMenus: false,
    fixedHeader: true,
    siderWidth: 220,
    onPageChange: () => {
      const { location } = history;
      const isLoginPage = location.pathname === loginPath;
      const isAuthenticated = Boolean(initialState?.currentUser?.id);

      if (!isAuthenticated && !isLoginPage) {
        history.replace(loginPath);
        return;
      }

      if (isAuthenticated && isLoginPage) {
        history.replace('/dashboard');
      }
    },
  };
};

export const request: RequestConfig = {
  credentials: 'include',
};
