import type { CommentRecord } from '@/services/admin';
import { fetchComments, updateComment } from '@/services/admin';
import {
  DrawerForm,
  PageContainer,
  ProFormRadio,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components';
import { Alert, Button, Space, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';

function formatDate(value?: string) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  });
}

function renderStatus(status: CommentRecord['reviewStatus']) {
  if (status === 'approved') {
    return <Tag color="success">已通过</Tag>;
  }

  if (status === 'rejected') {
    return <Tag color="error">已驳回</Tag>;
  }

  return <Tag color="processing">待审核</Tag>;
}

const CommentsPage = () => {
  const [records, setRecords] = useState<CommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [editingRecord, setEditingRecord] = useState<CommentRecord | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadComments = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const nextRecords = await fetchComments();
      setRecords(nextRecords);
    } catch (error: any) {
      setErrorMessage(error?.data?.message || error?.message || '评论列表加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadComments();
  }, []);

  return (
    <PageContainer
      title="评论管理"
      subTitle="集中审核 AI 生成评论、人工修改最终文案，并维护审核状态。"
    >
      {errorMessage ? (
        <Alert
          showIcon
          type="error"
          style={{ marginBottom: 16 }}
          message="评论列表加载失败"
          description={errorMessage}
        />
      ) : null}
      <ProTable<CommentRecord>
        rowKey="id"
        loading={loading}
        search={false}
        options={false}
        pagination={{
          pageSize: 10,
        }}
        dataSource={records}
        headerTitle="评论记录"
        toolBarRender={() => [
          <Button key="refresh" onClick={() => loadComments()}>
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
            title: '用户',
            dataIndex: 'userName',
            width: 160,
          },
          {
            title: '订单号',
            dataIndex: 'orderNumber',
            width: 160,
            render: (value: string) => value || '未填写',
          },
          {
            title: '评论内容',
            dataIndex: 'review',
            render: (value: string) => (
              <Typography.Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0 }}>
                {value}
              </Typography.Paragraph>
            ),
          },
          {
            title: '审核状态',
            dataIndex: 'reviewStatus',
            width: 120,
            render: (value: CommentRecord['reviewStatus']) => renderStatus(value),
          },
          {
            title: '来源',
            dataIndex: 'provider',
            width: 140,
          },
          {
            title: '更新时间',
            dataIndex: 'updatedAt',
            width: 180,
            render: (value: string) => formatDate(value),
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
        title={editingRecord ? `${editingRecord.platformName} / ${editingRecord.brandName}` : '审核评论'}
        width={720}
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
            await updateComment(editingRecord.id, {
              review: String(values.review ?? '').trim(),
              reviewStatus: values.reviewStatus,
              reviewNote: String(values.reviewNote ?? '').trim(),
            });
            message.success('评论已更新');
            setDrawerOpen(false);
            setEditingRecord(undefined);
            await loadComments();
            return true;
          } catch (submitError: any) {
            message.error(
              submitError?.data?.message || submitError?.message || '保存评论失败',
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
            message={`用户：${editingRecord.userName || '未命名用户'} | 创建时间：${formatDate(editingRecord.createdAt)}`}
            description={
              editingRecord.warning
                ? `生成提示：${editingRecord.warning}`
                : 'AI 初稿会保留在下方，方便你对照修改。'
            }
          />
        ) : null}
        <ProFormTextArea
          name="review"
          label="最终评论"
          rules={[
            {
              required: true,
              message: '请输入最终评论内容',
            },
          ]}
          fieldProps={{ rows: 7 }}
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
                {editingRecord.originalReview || '暂无 AI 初稿'}
              </Typography.Paragraph>
            }
          />
        ) : null}
      </DrawerForm>
    </PageContainer>
  );
};

export default CommentsPage;
