import type { AppealRecord } from '@/services/admin';
import { fetchAppeals, updateAppeal } from '@/services/admin';
import {
  DrawerForm,
  PageContainer,
  ProFormRadio,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components';
import { Alert, Button, Image, Space, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';

function formatDate(value?: string) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  });
}

function renderStatus(status: AppealRecord['reviewStatus']) {
  if (status === 'approved') {
    return <Tag color="success">已通过</Tag>;
  }

  if (status === 'rejected') {
    return <Tag color="error">已驳回</Tag>;
  }

  return <Tag color="processing">待审核</Tag>;
}

const AppealsPage = () => {
  const [records, setRecords] = useState<AppealRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [editingRecord, setEditingRecord] = useState<AppealRecord | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadAppeals = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const nextRecords = await fetchAppeals();
      setRecords(nextRecords);
    } catch (error: any) {
      setErrorMessage(error?.data?.message || error?.message || '申诉列表加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAppeals();
  }, []);

  return (
    <PageContainer
      title="申诉管理"
      subTitle="集中审核 AI 生成申诉文案，并支持人工修订后再提交。"
    >
      {errorMessage ? (
        <Alert
          showIcon
          type="error"
          style={{ marginBottom: 16 }}
          message="申诉列表加载失败"
          description={errorMessage}
        />
      ) : null}
      <ProTable<AppealRecord>
        rowKey="id"
        loading={loading}
        search={false}
        options={false}
        pagination={{
          pageSize: 10,
        }}
        dataSource={records}
        headerTitle="申诉记录"
        toolBarRender={() => [
          <Button key="refresh" onClick={() => loadAppeals()}>
            刷新
          </Button>,
        ]}
        columns={[
          {
            title: '平台 / 商标',
            dataIndex: 'platformName',
            render: (_: unknown, record) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{record.platformName}</Typography.Text>
                <Typography.Text type="secondary">{record.brandName}</Typography.Text>
              </Space>
            ),
          },
          {
            title: '差评摘要',
            dataIndex: 'complaintText',
            render: (_: unknown, record) => (
              <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                {record.complaintText || '无'}
              </Typography.Paragraph>
            ),
          },
          {
            title: '证据图',
            dataIndex: 'evidenceImages',
            width: 110,
            render: (_: unknown, record) => String(record.evidenceImages?.length || 0),
          },
          {
            title: '审核状态',
            dataIndex: 'reviewStatus',
            width: 120,
            render: (_: unknown, record) => renderStatus(record.reviewStatus),
          },
          {
            title: '更新时间',
            dataIndex: 'updatedAt',
            width: 180,
            render: (_: unknown, record) => formatDate(record.updatedAt),
          },
          {
            title: '操作',
            valueType: 'option',
            width: 120,
            render: (_: unknown, record) => [
              <a
                key="edit"
                onClick={() => {
                  setEditingRecord(record);
                  setDrawerOpen(true);
                }}
              >
                审核编辑
              </a>,
            ],
          },
        ]}
      />

      <DrawerForm
        title={editingRecord ? `${editingRecord.platformName} / ${editingRecord.brandName}` : '审核申诉'}
        width={760}
        open={drawerOpen}
        initialValues={editingRecord}
        drawerProps={{
          destroyOnClose: true,
          onClose: () => {
            setDrawerOpen(false);
            setEditingRecord(undefined);
          },
        }}
        onFinish={async (values) => {
          if (!editingRecord) {
            return false;
          }

          try {
            await updateAppeal(editingRecord.id, {
              appealText: String(values.appealText ?? '').trim(),
              reviewStatus: values.reviewStatus,
              reviewNote: String(values.reviewNote ?? '').trim(),
            });
            message.success('申诉记录已更新');
            setDrawerOpen(false);
            setEditingRecord(undefined);
            await loadAppeals();
            return true;
          } catch (submitError: any) {
            message.error(
              submitError?.data?.message || submitError?.message || '保存申诉记录失败',
            );
            return false;
          }
        }}
      >
        {editingRecord ? (
          <Alert
            showIcon
            type="info"
            style={{ marginBottom: 16 }}
            message={`创建时间：${formatDate(editingRecord.createdAt)} | 证据图：${editingRecord.evidenceImages?.length || 0} 张`}
            description={
              editingRecord.warning
                ? `生成提示：${editingRecord.warning}`
                : '你可以基于差评内容和证据图人工修订申诉文案。'
            }
          />
        ) : null}

        {editingRecord && editingRecord.evidenceImages?.length ? (
          <div style={{ marginBottom: 16 }}>
            <Typography.Text strong>证据图片</Typography.Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
              {editingRecord.evidenceImages.map((item, index) => (
                <Image
                  key={`${editingRecord.id}-${index}`}
                  src={item.url}
                  width={88}
                  height={88}
                  style={{ objectFit: 'cover', borderRadius: 8 }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {editingRecord ? (
          <Alert
            showIcon
            type="warning"
            style={{ marginBottom: 16 }}
            message="差评原文"
            description={editingRecord.complaintText || '无'}
          />
        ) : null}

        <ProFormTextArea
          name="appealText"
          label="最终申诉文案"
          rules={[
            {
              required: true,
              message: '请输入最终申诉内容',
            },
          ]}
          fieldProps={{ rows: 8 }}
        />
        <ProFormRadio.Group
          name="reviewStatus"
          label="审核状态"
          rules={[
            {
              required: true,
              message: '请选择审核状态',
            },
          ]}
          options={[
            {
              label: '待审核',
              value: 'pending',
            },
            {
              label: '已通过',
              value: 'approved',
            },
            {
              label: '已驳回',
              value: 'rejected',
            },
          ]}
        />
        <ProFormTextArea name="reviewNote" label="审核备注" fieldProps={{ rows: 4 }} />

        {editingRecord ? (
          <Alert
            showIcon
            type="warning"
            style={{ marginTop: 16 }}
            message="AI 初稿"
            description={
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                {editingRecord.originalAppealText || '暂无 AI 初稿'}
              </Typography.Paragraph>
            }
          />
        ) : null}
      </DrawerForm>
    </PageContainer>
  );
};

export default AppealsPage;
