import {
  fetchSettings,
  saveSettings,
  testAIVisionSettings,
  testAISettings,
} from '@/services/admin';
import {
  PageContainer,
  ProForm,
  type ProFormInstance,
  ProFormText,
} from '@ant-design/pro-components';
import { Alert, Button, Card, message } from 'antd';
import { useEffect, useRef, useState } from 'react';

const SettingsPage = () => {
  const [settings, setSettings] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const [visionTesting, setVisionTesting] = useState(false);
  const [testSummary, setTestSummary] = useState('');
  const formRef = useRef<ProFormInstance>();

  const buildAISettingsPayload = (values: any) => ({
    openai: {
      baseUrl: String(values.openai?.baseUrl ?? '').trim(),
      apiKey: String(values.openai?.apiKey ?? '').trim(),
      model: String(values.openai?.model ?? '').trim(),
    },
  });

  const handleTestConnection = async () => {
    const values = formRef.current?.getFieldsValue?.(true) ?? settings ?? {};

    try {
      setTesting(true);
      setTestSummary('');
      const result = await testAISettings(buildAISettingsPayload(values));
      const detail = `连接成功 · ${result.provider} · ${result.latencyMs}ms`;

      setTestSummary(detail);
      message.success(detail);

      if (result.warning) {
        message.warning(result.warning);
      }
    } catch (error: any) {
      const msg = error?.data?.message || error?.message || '测试失败';
      setTestSummary(`连接失败 · ${msg}`);
      message.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const handleVisionTestConnection = async () => {
    const values = formRef.current?.getFieldsValue?.(true) ?? settings ?? {};
    const imageUrl = String(values.visionTestImageUrl ?? '').trim();

    try {
      setVisionTesting(true);
      setTestSummary('');
      const result = await testAIVisionSettings({
        ...buildAISettingsPayload(values),
        imageUrl,
      });
      const detail = `多模态连接成功 · ${result.provider} · ${result.latencyMs}ms`;

      setTestSummary(detail);
      message.success(detail);

      if (result.warning) {
        message.warning(result.warning);
      }
    } catch (error: any) {
      const msg = error?.data?.message || error?.message || '多模态测试失败';
      setTestSummary(`多模态连接失败 · ${msg}`);
      message.error(msg);
    } finally {
      setVisionTesting(false);
    }
  };

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
      title="AI 配置"
      subTitle="配置 OpenAI 兼容网关并测试文本、多模态连通性。提示词配置请前往“提示词管理”。"
    >
      {errorMessage ? (
        <Alert
          showIcon
          type="error"
          style={{ marginBottom: 16 }}
          message="配置加载失败"
          description={errorMessage}
        />
      ) : null}

      <Card
        title="OpenAI 兼容接口"
        loading={loading}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button loading={testing} onClick={handleTestConnection}>
              {testing ? '测试中...' : '测试 AI 连接'}
            </Button>
            <Button loading={visionTesting} onClick={handleVisionTestConnection}>
              {visionTesting ? '测试中...' : '测试多模态'}
            </Button>
          </div>
        }
      >
        {testSummary ? (
          <Alert
            showIcon
            type={testSummary.startsWith('连接成功') ? 'success' : 'warning'}
            style={{ marginBottom: 16 }}
            message="测试结果"
            description={testSummary}
          />
        ) : null}

        <ProForm
          key={JSON.stringify(settings ?? {})}
          formRef={formRef}
          submitter={{
            searchConfig: {
              submitText: '保存 AI 配置',
            },
          }}
          initialValues={settings}
          onFinish={async (values) => {
            try {
              await saveSettings(buildAISettingsPayload(values));
              message.success('AI 配置已保存');
              await loadSettings();
              return true;
            } catch (submitError: any) {
              message.error(
                submitError?.data?.message || submitError?.message || '保存配置失败',
              );
              return false;
            }
          }}
        >
          <ProForm.Group>
            <ProFormText
              name={['openai', 'baseUrl']}
              label="Base URL"
              width="md"
              placeholder="例如：https://api.openai.com/v1"
            />
            <ProFormText
              name={['openai', 'model']}
              label="模型名称"
              width="sm"
              placeholder="例如：gpt-4.1-mini"
            />
          </ProForm.Group>

          <ProFormText.Password
            name={['openai', 'apiKey']}
            label="API Key"
            placeholder="请输入 OpenAI 兼容接口的密钥"
          />

          <ProFormText
            name="visionTestImageUrl"
            label="多模态测试图片 URL"
            placeholder="例如：https://example.com/test-image.jpg"
            extra="仅用于测试图片理解连通性，不会随“保存 AI 配置”持久化。"
          />
        </ProForm>
      </Card>
    </PageContainer>
  );
};

export default SettingsPage;
