import type { AppealRecord, DashboardPayload, Platform } from '@/services/admin';
import { fetchDashboard } from '@/services/admin';
import { history } from '@umijs/max';
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';

const { Paragraph, Text } = Typography;

function formatDate(value?: string) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  });
}

function buildBrandNames(platform: Platform, data?: DashboardPayload) {
  const brands =
    data?.brands.filter((brand) => {
      const platformIds = brand.platformIds ?? [];

      if (platformIds.length === 0) {
        return true;
      }

      return platformIds.includes(platform.id);
    }) ?? [];

  return brands.map((brand) => brand.name);
}

function appealStatusTag(status: AppealRecord['reviewStatus']) {
  if (status === 'approved') {
    return <Tag color="success">已通过</Tag>;
  }

  if (status === 'rejected') {
    return <Tag color="error">已驳回</Tag>;
  }

  return <Tag color="processing">待审核</Tag>;
}

const DashboardPage = () => {
  const [data, setData] = useState<DashboardPayload>();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const openaiConfigured =
    Boolean(data?.settings?.openai?.baseUrl?.trim()) && Boolean(data?.settings?.openai?.apiKey?.trim());

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setErrorMessage('');
        const nextData = await fetchDashboard();

        if (mounted) {
          setData(nextData);
        }
      } catch (error: any) {
        if (mounted) {
          setErrorMessage(error?.data?.message || error?.message || '概览数据加载失败。');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <PageContainer
      title="首页概览"
      subTitle="聚焦申诉处理效率与配置健康状态，帮助你快速完成日常运营。"
      extra={[
        <Button key="go-appeals" type="primary" onClick={() => history.push('/appeals')}>
          去处理申诉
        </Button>,
        <Button key="go-prompts" onClick={() => history.push('/prompts')}>
          去调提示词
        </Button>,
        <Button key="go-settings" onClick={() => history.push('/settings')}>
          去看 AI 配置
        </Button>,
      ]}
    >
      {errorMessage ? (
        <Alert
          showIcon
          type="error"
          style={{ marginBottom: 16 }}
          message="概览数据加载失败"
          description={errorMessage}
        />
      ) : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="平台数量" value={data?.summary.platformCount ?? 0} suffix="个" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="商标数量" value={data?.summary.brandCount ?? 0} suffix="个" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="申诉总量" value={data?.summary.appealCount ?? 0} suffix="条" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="待审核申诉"
              value={data?.summary.pendingAppealCount ?? 0}
              suffix="条"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col xs={24} xl={8}>
          <Card title="今日新增申诉" loading={loading}>
            <Statistic
              title="新增数量"
              value={data?.summary.todayNewAppealCount ?? 0}
              suffix="条"
            />
            <Text type="secondary">按服务器本地时间自然日统计。</Text>
          </Card>
        </Col>
        <Col xs={24} xl={16}>
          <Card title="处理时长趋势（近7天）" loading={loading}>
            {data?.processingTrend?.length ? (
              <List
                dataSource={data.processingTrend}
                renderItem={(item) => (
                  <List.Item>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text>{item.date}</Text>
                      <Text type="secondary">完成 {item.completedCount} 条</Text>
                      <Text>
                        平均 {item.completedCount ? `${item.avgProcessingHours} 小时` : '-'}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无处理时长数据" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col xs={24} xl={12}>
          <Card title="申诉审核进度" loading={loading}>
            <Row gutter={[16, 16]}>
              <Col span={8}>
                <Statistic title="待审核" value={data?.summary.pendingAppealCount ?? 0} />
              </Col>
              <Col span={8}>
                <Statistic title="已通过" value={data?.summary.approvedAppealCount ?? 0} />
              </Col>
              <Col span={8}>
                <Statistic title="已驳回" value={data?.summary.rejectedAppealCount ?? 0} />
              </Col>
            </Row>
            <Alert
              showIcon
              type={openaiConfigured ? 'success' : 'warning'}
              style={{ marginTop: 16 }}
              message={openaiConfigured ? 'AI 网关配置正常' : 'AI 网关尚未完整配置'}
              description={
                openaiConfigured
                  ? `模型：${data?.settings?.openai?.model || '-'}，可前往 AI 配置页执行连通测试。`
                  : '当前 Base URL 或 API Key 为空，建议先补全后再批量生成申诉文案。'
              }
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="最近平台" loading={loading}>
            {data?.platforms?.length ? (
              <List
                dataSource={data.platforms.slice(0, 6)}
                renderItem={(platform) => {
                  const brandNames = buildBrandNames(platform, data);

                  return (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space>
                            <Text strong>{platform.name}</Text>
                            {platform.enabled ? (
                              <Tag color="success">启用中</Tag>
                            ) : (
                              <Tag>已停用</Tag>
                            )}
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size={4}>
                            <Text type="secondary">平台编码：{platform.code || '-'}</Text>
                            <Text type="secondary">
                              关联商标：{brandNames.length ? brandNames.join('、') : '暂未配置'}
                            </Text>
                            <Text type="secondary">
                              更新时间：{formatDate(platform.updatedAt)}
                            </Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            ) : (
              <Empty description="还没有平台数据" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col xs={24} xl={12}>
          <Card title="待处理申诉" loading={loading}>
            {data?.appeals?.length ? (
              <List
                dataSource={data.appeals.filter((item) => item.reviewStatus === 'pending')}
                pagination={{
                  pageSize: 5,
                  size: 'small',
                  showSizeChanger: false,
                }}
                renderItem={(appeal) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space wrap>
                          <Text strong>{appeal.platformName}</Text>
                          <Text type="secondary">/ {appeal.brandName}</Text>
                          {appealStatusTag(appeal.reviewStatus)}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={4}>
                          <Text type="secondary">证据图：{appeal.evidenceImages?.length || 0} 张</Text>
                          <Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ margin: 0 }}>
                            {appeal.complaintText || '无差评内容'}
                          </Paragraph>
                          <Text type="secondary">
                            更新时间：{formatDate(appeal.updatedAt)}
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="还没有申诉记录" />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="最新评论（参考）" loading={loading}>
            {data?.comments?.length ? (
              <List
                dataSource={data.comments}
                pagination={{
                  pageSize: 5,
                  size: 'small',
                  showSizeChanger: false,
                }}
                renderItem={(comment) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space wrap>
                          <Text strong>{comment.platformName}</Text>
                          <Text type="secondary">/ {comment.brandName}</Text>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={4}>
                          <Text type="secondary">用户：{comment.userName || '未命名用户'}</Text>
                          <Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ margin: 0 }}>
                            {comment.review}
                          </Paragraph>
                          <Text type="secondary">生成时间：{formatDate(comment.createdAt)}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="还没有评论记录" />
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default DashboardPage;
