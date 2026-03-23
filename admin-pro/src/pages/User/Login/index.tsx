import { login } from '@/services/admin';
import {
  LoginFormPage,
  ProFormCheckbox,
  ProFormText,
} from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import { Alert, message } from 'antd';
import { useState } from 'react';

const LoginPage = () => {
  const { setInitialState } = useModel('@@initialState');
  const [errorMessage, setErrorMessage] = useState('');

  return (
    <LoginFormPage
      title="抖音评论后台"
      subTitle="登录后进入标准管理后台，对平台、商标、评论和 AI 配置统一管理。"
      backgroundImageUrl="https://gw.alipayobjects.com/zos/basement_prod/4f51f4d4-bbc7-44d7-9aba-7b9ab84a7a8d.svg"
      submitter={{
        searchConfig: {
          submitText: '登录后台',
        },
      }}
      onFinish={async (values) => {
        try {
          const session = await login(values.username, values.password);

          if (!session.authenticated || !session.admin) {
            setErrorMessage('登录状态未建立，请稍后重试。');
            return false;
          }

          await setInitialState((state) => ({
            ...state,
            currentUser: session.admin,
          }));

          message.success('登录成功');
          history.replace('/dashboard');
          return true;
        } catch (error: any) {
          setErrorMessage(error?.data?.message || error?.message || '登录失败，请重试。');
          return false;
        }
      }}
    >
      {errorMessage ? (
        <Alert
          showIcon
          type="error"
          style={{ marginBottom: 24 }}
          message={errorMessage}
        />
      ) : null}
      <ProFormText
        name="username"
        fieldProps={{
          size: 'large',
        }}
        placeholder="请输入后台账号"
        initialValue="admin"
        rules={[
          {
            required: true,
            message: '请输入账号',
          },
        ]}
      />
      <ProFormText.Password
        name="password"
        fieldProps={{
          size: 'large',
        }}
        placeholder="请输入后台密码"
        rules={[
          {
            required: true,
            message: '请输入密码',
          },
        ]}
      />
      <ProFormCheckbox noStyle name="remember">
        保持当前设备登录状态
      </ProFormCheckbox>
    </LoginFormPage>
  );
};

export default LoginPage;
