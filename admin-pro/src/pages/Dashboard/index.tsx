import type { CommentRecord, DashboardPayload, Platform } from '@/services/admin';
import { fetchDashboard } from '@/services/admin';
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
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
    data?.brands.filter((brand) => (brand.platformIds ?? []).includes(platform.id)) ?? [];

  return brands.map((brand) => brand.name);
}

function reviewStatusTag(status: CommentRecord['reviewStatus']) {
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
      subTitle="登录后直接进入标准后台首页，不再使用同页切换的旧后台结构。"
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
            <Statistic title="评论记录" value={data?.summary.commentCount ?? 0} suffix="条" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="待审核评论"
              value={data?.summary.pendingReviewCount ?? 0}
              suffix="条"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
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
        <Col xs={24} xl={12}>
          <Card title="最新评论" loading={loading}>
            {data?.comments?.length ? (
              <List
                dataSource={data.comments.slice(0, 6)}
                renderItem={(comment) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space wrap>
                          <Text strong>{comment.platformName}</Text>
                          <Text type="secondary">/ {comment.brandName}</Text>
                          {reviewStatusTag(comment.reviewStatus)}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={4}>
                          <Text type="secondary">
                            用户：{comment.userName || '未命名用户'}
                          </Text>
                          <Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ margin: 0 }}>
                            {comment.review}
                          </Paragraph>
                          <Text type="secondary">
                            生成时间：{formatDate(comment.createdAt)}
                          </Text>
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
