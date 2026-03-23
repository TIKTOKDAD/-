import { fetchSettings, saveSettings } from '@/services/admin';
import {
  PageContainer,
  ProForm,
  ProFormRadio,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { Alert, Card, message } from 'antd';
import { useEffect, useState } from 'react';

const PromptsPage = () => {
  const [settings, setSettings] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadSettings = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const nextSettings = await fetchSettings();
      setSettings(nextSettings);
    } catch (error: any) {
      setErrorMessage(error?.data?.message || error?.message || '配置加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  return (
    <PageContainer
      title="提示词管理"
      subTitle="集中维护评论和申诉的系统提示词、模板与模板启用策略。"
    >
      {errorMessage ? (
        <Alert
          showIcon
          type="error"
          style={{ marginBottom: 16 }}
          message="提示词加载失败"
          description={errorMessage}
        />
      ) : null}
      <Card title="模板与提示词配置" loading={loading}>
        <ProForm
          key={JSON.stringify(settings ?? {})}
          submitter={{
            searchConfig: {
              submitText: '保存提示词配置',
            },
          }}
          initialValues={settings}
          onFinish={async (values) => {
            try {
              await saveSettings({
                defaultUserPrefix: String(values.defaultUserPrefix ?? '').trim(),
                defaultSystemPrompt: String(values.defaultSystemPrompt ?? '').trim(),
                defaultPromptTemplate: String(values.defaultPromptTemplate ?? '').trim(),
                appealSystemPrompt: String(values.appealSystemPrompt ?? '').trim(),
                appealPromptTemplate: String(values.appealPromptTemplate ?? '').trim(),
                appealTemplateMode: values.appealTemplateMode === 'platform' ? 'platform' : 'default',
              });
              message.success('提示词配置已保存');
              await loadSettings();
              return true;
            } catch (submitError: any) {
              message.error(
                submitError?.data?.message || submitError?.message || '保存提示词配置失败',
              );
              return false;
            }
          }}
        >
          <ProFormText name="defaultUserPrefix" label="默认用户前缀" width="sm" />
          <ProFormTextArea
            name="defaultSystemPrompt"
            label="评论系统提示词"
            fieldProps={{ rows: 4 }}
          />
          <ProFormTextArea
            name="defaultPromptTemplate"
            label="默认评论模板"
            extra="支持变量：{{platformName}}、{{brandName}}、{{orderNumber}}、{{userName}}、{{rating}}、{{customerNote}}。"
            fieldProps={{ rows: 6 }}
          />
          <ProFormTextArea
            name="appealSystemPrompt"
            label="申诉系统提示词"
            fieldProps={{ rows: 4 }}
            extra="用于指导模型输出申诉语气、论证结构和风险边界。"
          />
          <ProFormTextArea
            name="appealPromptTemplate"
            label="申诉模板"
            extra="支持变量：{{platformName}}、{{brandName}}、{{complaintText}}、{{merchantNote}}、{{imageHint}}。"
            fieldProps={{ rows: 8 }}
          />
          <ProFormRadio.Group
            name="appealTemplateMode"
            label="申诉模板启用方式"
            initialValue="default"
            options={[
              {
                label: '使用默认申诉模板',
                value: 'default',
              },
              {
                label: '平台模板优先（无则回退默认）',
                value: 'platform',
              },
            ]}
          />
        </ProForm>
      </Card>
    </PageContainer>
  );
};

export default PromptsPage;