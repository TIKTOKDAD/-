import { logout, updatePassword } from '@/services/admin';
import { PageContainer, ProForm, ProFormText } from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import { Alert, Button, Card, Space, message } from 'antd';

const AccountPage = () => {
  const { setInitialState } = useModel('@@initialState');

  return (
    <PageContainer
      title="账号管理"
      subTitle="维护管理员账号安全设置，支持修改密码和退出登录。"
    >
      <Card title="账号安全" style={{ maxWidth: 760 }}>
        <ProForm
          submitter={{
            searchConfig: {
              submitText: '修改密码',
            },
            resetButtonProps: false,
          }}
          onFinish={async (values) => {
            try {
              await updatePassword({
                currentPassword: String(values.currentPassword ?? ''),
                newPassword: String(values.newPassword ?? ''),
              });
              message.success('密码已更新');
              return true;
            } catch (submitError: any) {
              message.error(
                submitError?.data?.message || submitError?.message || '修改密码失败',
              );
              return false;
            }
          }}
        >
          <ProFormText.Password
            name="currentPassword"
            label="当前密码"
            rules={[
              {
                required: true,
                message: '请输入当前密码',
              },
            ]}
          />
          <ProFormText.Password
            name="newPassword"
            label="新密码"
            rules={[
              {
                required: true,
                message: '请输入新密码',
              },
              {
                min: 8,
                message: '新密码至少 8 位',
              },
            ]}
          />
        </ProForm>
        <Alert
          showIcon
          type="info"
          style={{ marginTop: 16 }}
          message="退出登录"
          description="退出后会回到登录页，再次进入后台需要重新登录。"
        />
        <Space style={{ marginTop: 16 }}>
          <Button
            danger
            onClick={async () => {
              await logout();
              await setInitialState((state) => ({
                ...state,
                currentUser: undefined,
              }));
              history.replace('/user/login');
            }}
          >
            退出登录
          </Button>
        </Space>
      </Card>
    </PageContainer>
  );
};

export default AccountPage;
