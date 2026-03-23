import type { Brand, DashboardPayload, Platform } from '@/services/admin';
import {
  createBrand,
  createPlatform,
  deleteBrand,
  deletePlatform,
  fetchDashboard,
  updateBrand,
  updatePlatform,
  uploadBrandLogo,
} from '@/services/admin';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { ProColumns, ProFormInstance } from '@ant-design/pro-components';
import {
  ModalForm,
  PageContainer,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Image,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

type PlatformRow = Platform & {
  brands: Brand[];
};

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const LOGO_ACCEPT = ALLOWED_LOGO_TYPES.join(',');
const LOGO_MAX_SIZE = 5 * 1024 * 1024;

function buildPlatformRows(data?: DashboardPayload): PlatformRow[] {
  if (!data) {
    return [];
  }

  return data.platforms.map((platform) => ({
    ...platform,
    brands: data.brands.filter((brand) => (brand.platformIds ?? []).includes(platform.id)),
  }));
}

function formatDate(value?: string) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  });
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const [, base64 = ''] = result.split(',');
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error('读取图片失败，请重试。'));
    };

    reader.readAsDataURL(file);
  });
}

const PlatformsPage = () => {
  const [dashboard, setDashboard] = useState<DashboardPayload>();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [platformModalOpen, setPlatformModalOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<Platform | undefined>();
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | undefined>();
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>('');
  const [brandLogoPreview, setBrandLogoPreview] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const brandFormRef = useRef<ProFormInstance>();
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const nextData = await fetchDashboard();
      setDashboard(nextData);
    } catch (error: any) {
      setErrorMessage(error?.data?.message || error?.message || '平台数据加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const platformRows = buildPlatformRows(dashboard);
  const selectedPlatform = platformRows.find((item) => item.id === selectedPlatformId);

  const closePlatformModal = () => {
    setPlatformModalOpen(false);
    setEditingPlatform(undefined);
  };

  const closeBrandModal = () => {
    setBrandModalOpen(false);
    setEditingBrand(undefined);
    setBrandLogoPreview('');
    setUploadingLogo(false);

    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const openCreateBrandModal = () => {
    setEditingBrand(undefined);
    setBrandLogoPreview('');
    setBrandModalOpen(true);
  };

  const openEditBrandModal = (brand: Brand) => {
    setEditingBrand(brand);
    setBrandLogoPreview(brand.logoUrl || '');
    setBrandModalOpen(true);
  };

  const handleBrandLogoUpload = async (file: File) => {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      message.error('Logo 仅支持 PNG、JPG、GIF 或 WEBP 图片。');
      return;
    }

    if (file.size > LOGO_MAX_SIZE) {
      message.error('Logo 图片大小不能超过 5 MB。');
      return;
    }

    try {
      setUploadingLogo(true);
      const contentBase64 = await fileToBase64(file);
      const result = await uploadBrandLogo({
        filename: file.name,
        contentType: file.type,
        contentBase64,
      });

      brandFormRef.current?.setFieldsValue({
        logoUrl: result.url,
      });
      setBrandLogoPreview(result.url);
      message.success('Logo 上传成功，已自动填入地址。');
    } catch (error: any) {
      message.error(error?.data?.message || error?.message || 'Logo 上传失败，请稍后重试。');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    await handleBrandLogoUpload(file);
  };

  const platformColumns: ProColumns<PlatformRow>[] = [
    {
      title: '平台名称',
      dataIndex: 'name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.name}</Typography.Text>
          <Typography.Text type="secondary">编码：{record.code || '-'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 120,
      render: (_, record) =>
        record.enabled ? <Tag color="success">已启用</Tag> : <Tag>已停用</Tag>,
    },
    {
      title: '商标数',
      dataIndex: 'brandCount',
      width: 100,
      render: (_, record) => record.brands.length,
    },
    {
      title: '\u5546\u6807\u5217\u8868',
      dataIndex: 'brands',
      render: (_, record) =>
        record.brands.length ? (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {record.brands.map((brand) => (
              <Space key={brand.id} size={8} wrap>
                {brand.logoUrl ? (
                  <Image
                    width={28}
                    height={28}
                    src={brand.logoUrl}
                    alt={brand.name}
                    preview={false}
                    style={{ objectFit: 'cover', borderRadius: 8 }}
                  />
                ) : (
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      background: 'rgba(217, 95, 48, 0.12)',
                      color: '#b94c20',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {brand.name.slice(0, 1)}
                  </span>
                )}
                <Typography.Text>{brand.name}</Typography.Text>
              </Space>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">\u6682\u672a\u914d\u7f6e</Typography.Text>
        ),
    },
    {
      title: '平台提示词',
      dataIndex: 'promptTemplate',
      render: (value: string) =>
        value ? (
          <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
            {value}
          </Typography.Paragraph>
        ) : (
          <Typography.Text type="secondary">使用全局默认模板</Typography.Text>
        ),
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
      width: 220,
      render: (_, record) => [
        <a
          key="brands"
          onClick={() => {
            setSelectedPlatformId(record.id);
          }}
        >
          管理商标
        </a>,
        <a
          key="edit"
          onClick={() => {
            setEditingPlatform(record);
            setPlatformModalOpen(true);
          }}
        >
          编辑
        </a>,
        <a
          key="delete"
          onClick={() => {
            Modal.confirm({
              title: `确认删除平台“${record.name}”吗？`,
              content:
                '仅属于该平台的商标也会一起从管理后台移除，请确认后再删除。',
              okText: '删除',
              okButtonProps: {
                danger: true,
              },
              cancelText: '取消',
              async onOk() {
                try {
                  await deletePlatform(record.id);
                  message.success('平台已删除。');

                  if (selectedPlatformId === record.id) {
                    setSelectedPlatformId('');
                  }

                  await loadDashboard();
                } catch (deleteError: any) {
                  message.error(
                    deleteError?.data?.message || deleteError?.message || '删除平台失败。',
                  );
                }
              },
            });
          }}
        >
          删除
        </a>,
      ],
    },
  ];

  const brandColumns: ColumnsType<Brand> = [
    {
      title: '商标名称',
      dataIndex: 'name',
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary">
            更新时间：{formatDate(record.updatedAt)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Logo',
      dataIndex: 'logoUrl',
      render: (value: string, record) =>
        value ? (
          <Space align="start" size={12}>
            <Image
              width={48}
              height={48}
              src={value}
              alt={record.name}
              style={{ objectFit: 'cover', borderRadius: 12 }}
            />
            <Typography.Paragraph
              copyable
              ellipsis={{ rows: 2, expandable: false }}
              style={{ marginBottom: 0, maxWidth: 260 }}
            >
              {value}
            </Typography.Paragraph>
          </Space>
        ) : (
          <Typography.Text type="secondary">未配置</Typography.Text>
        ),
    },
    {
      title: '备注',
      dataIndex: 'note',
      render: (value: string) =>
        value ? (
          <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
            {value}
          </Typography.Paragraph>
        ) : (
          <Typography.Text type="secondary">无</Typography.Text>
        ),
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <a
            onClick={() => {
              openEditBrandModal(record);
            }}
          >
            编辑
          </a>
          <a
            onClick={() => {
              Modal.confirm({
                title: `确认删除商标“${record.name}”吗？`,
                okText: '删除',
                okButtonProps: {
                  danger: true,
                },
                cancelText: '取消',
                async onOk() {
                  try {
                    await deleteBrand(record.id);
                    message.success('商标已删除。');
                    await loadDashboard();
                  } catch (deleteError: any) {
                    message.error(
                      deleteError?.data?.message || deleteError?.message || '删除商标失败。',
                    );
                  }
                },
              });
            }}
          >
            删除
          </a>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="平台管理"
      subTitle="平台和商标合并到同一个管理入口，后台不再保留订单导入和订单队列。"
    >
      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="这里统一维护平台、商标、平台提示词和启用状态。"
      />
      {errorMessage ? (
        <Alert
          showIcon
          type="error"
          style={{ marginBottom: 16 }}
          message="平台数据加载失败"
          description={errorMessage}
        />
      ) : null}
      <ProTable<PlatformRow>
        rowKey="id"
        loading={loading}
        search={false}
        options={false}
        pagination={false}
        dataSource={platformRows}
        columns={platformColumns}
        headerTitle="平台列表"
        toolBarRender={() => [
          <Button
            key="new-platform"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingPlatform(undefined);
              setPlatformModalOpen(true);
            }}
          >
            新增平台
          </Button>,
        ]}
      />

      <Drawer
        title={selectedPlatform ? `${selectedPlatform.name} 的商标管理` : '商标管理'}
        width={820}
        destroyOnClose
        open={Boolean(selectedPlatformId)}
        onClose={() => {
          setSelectedPlatformId('');
          setEditingBrand(undefined);
          setBrandLogoPreview('');
        }}
        extra={
          selectedPlatform ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateBrandModal}>
              新增商标
            </Button>
          ) : null
        }
      >
        {selectedPlatform ? (
          <Card bordered={false} bodyStyle={{ padding: 0 }}>
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }} size={4}>
              <Typography.Text type="secondary">
                平台编码：{selectedPlatform.code || '-'}
              </Typography.Text>
              <Typography.Text type="secondary">
                平台说明：{selectedPlatform.description || '未填写'}
              </Typography.Text>
            </Space>
            {selectedPlatform.brands.length ? (
              <Table
                rowKey="id"
                pagination={false}
                columns={brandColumns}
                dataSource={selectedPlatform.brands}
              />
            ) : (
              <Empty description="当前平台下还没有商标" />
            )}
          </Card>
        ) : null}
      </Drawer>

      <ModalForm
        title={editingPlatform ? '编辑平台' : '新增平台'}
        open={platformModalOpen}
        modalProps={{
          destroyOnClose: true,
          onCancel: closePlatformModal,
        }}
        initialValues={
          editingPlatform ?? {
            enabled: true,
          }
        }
        onFinish={async (values) => {
          try {
            const payload = {
              name: String(values.name ?? '').trim(),
              code: String(values.code ?? '').trim(),
              description: String(values.description ?? '').trim(),
              enabled: Boolean(values.enabled),
              promptTemplate: String(values.promptTemplate ?? '').trim(),
              appealPromptTemplate: String(values.appealPromptTemplate ?? '').trim(),
            };

            if (editingPlatform) {
              await updatePlatform(editingPlatform.id, payload);
              message.success('平台已更新。');
            } else {
              await createPlatform(payload);
              message.success('平台已创建。');
            }

            closePlatformModal();
            await loadDashboard();
            return true;
          } catch (submitError: any) {
            message.error(
              submitError?.data?.message || submitError?.message || '保存平台失败。',
            );
            return false;
          }
        }}
      >
        <ProFormText
          name="name"
          label="平台名称"
          rules={[
            {
              required: true,
              message: '请输入平台名称。',
            },
          ]}
        />
        <ProFormText
          name="code"
          label="平台编码"
          extra="建议使用稳定的英文编码，例如 meituan 或 eleme。"
          rules={[
            {
              required: true,
              message: '请输入平台编码。',
            },
          ]}
        />
        <ProFormTextArea name="description" label="平台说明" fieldProps={{ rows: 3 }} />
        <ProFormTextArea
          name="promptTemplate"
          label="平台提示词模板"
          extra="支持变量：{{platformName}}、{{brandName}}、{{orderNumber}}、{{userName}}、{{rating}}、{{customerNote}}。"
          fieldProps={{ rows: 6 }}
        />
        <ProFormTextArea
          name="appealPromptTemplate"
          label="平台申诉模板"
          extra="可选。支持变量：{{platformName}}、{{brandName}}、{{complaintText}}、{{merchantNote}}、{{imageHint}}。"
          fieldProps={{ rows: 6 }}
        />
        <ProFormSwitch name="enabled" label="启用状态" />
      </ModalForm>

      <ModalForm
        key={editingBrand?.id || 'new-brand'}
        title={editingBrand ? '编辑商标' : '新增商标'}
        open={brandModalOpen}
        formRef={brandFormRef}
        modalProps={{
          destroyOnClose: true,
          onCancel: closeBrandModal,
        }}
        initialValues={
          editingBrand ?? {
            name: '',
            logoUrl: '',
            note: '',
          }
        }
        onFinish={async (values) => {
          if (!selectedPlatform) {
            message.error('请先选择所属平台。');
            return false;
          }

          try {
            const payload = {
              platformId: selectedPlatform.id,
              name: String(values.name ?? '').trim(),
              logoUrl: String(values.logoUrl ?? '').trim(),
              note: String(values.note ?? '').trim(),
            };

            if (editingBrand) {
              await updateBrand(editingBrand.id, payload);
              message.success('商标已更新。');
            } else {
              await createBrand(payload);
              message.success('商标已创建。');
            }

            closeBrandModal();
            await loadDashboard();
            return true;
          } catch (submitError: any) {
            message.error(
              submitError?.data?.message || submitError?.message || '保存商标失败。',
            );
            return false;
          }
        }}
      >
        <ProFormText
          name="name"
          label="商标名称"
          rules={[
            {
              required: true,
              message: '请输入商标名称。',
            },
          ]}
        />
        <ProFormText
          name="logoUrl"
          label="Logo 地址"
          extra="可以直接粘贴外部图片地址，也可以使用下方按钮把图片上传到当前后台。"
          fieldProps={{
            placeholder: '请输入 Logo 图片 URL，或先上传文件自动回填',
            onChange: (event) => {
              setBrandLogoPreview(String(event?.target?.value ?? '').trim());
            },
          }}
        />
        <Card size="small" style={{ marginBottom: 24 }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <input
              ref={logoInputRef}
              type="file"
              accept={LOGO_ACCEPT}
              style={{ display: 'none' }}
              onChange={(event) => {
                void handleLogoInputChange(event);
              }}
            />
            <Space wrap>
              <Button
                icon={<UploadOutlined />}
                loading={uploadingLogo}
                onClick={() => {
                  logoInputRef.current?.click();
                }}
              >
                上传 Logo 文件
              </Button>
              <Typography.Text type="secondary">
                支持 PNG、JPG、GIF、WEBP，单张不超过 5 MB。
              </Typography.Text>
            </Space>
            {brandLogoPreview ? (
              <Space align="start" size={16} wrap>
                <Image
                  width={88}
                  height={88}
                  src={brandLogoPreview}
                  alt="logo 预览"
                  style={{ objectFit: 'cover', borderRadius: 16 }}
                />
                <Space direction="vertical" size={4} style={{ maxWidth: 520 }}>
                  <Typography.Text strong>当前预览</Typography.Text>
                  <Typography.Text type="secondary">{brandLogoPreview}</Typography.Text>
                </Space>
              </Space>
            ) : (
              <Typography.Text type="secondary">
                暂未选择 Logo。上传成功后会自动回填地址，并在这里显示预览。
              </Typography.Text>
            )}
          </Space>
        </Card>
        <ProFormTextArea
          name="note"
          label="备注"
          fieldProps={{ rows: 4 }}
          extra="这里可以放品牌定位、门店特色或营销信息。"
        />
      </ModalForm>
    </PageContainer>
  );
};

export default PlatformsPage;
