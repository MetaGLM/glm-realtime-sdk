import React from 'react';
import { FunctionCallQueueItem } from '@/types/realtime.ts';
import { Flex, Form, Input, Row, Col } from 'antd';

type Props = {
  queue: FunctionCallQueueItem[];
  onChange: (values: { responses: Record<string, string> }) => void;
};

const FunctionCallResponseEditor: React.FC<Props> = props => {
  const { queue, onChange } = props;
  const [form] = Form.useForm();

  return (
    <Flex
      vertical
      gap="middle"
      style={{ maxHeight: '75vh', overflowY: 'scroll', padding: 16 }}
    >
      <Form
        form={form}
        onValuesChange={(_, values) => {
          console.log('values -->', values);
          onChange(values);
        }}
      >
        <Form.List name="responses">
          {() => (
            <Row gutter={[16, 16]}>
              {queue.map(item => (
                <Col span={12} key={item.id}>
                  <Form.Item>
                    <Flex vertical gap="small">
                      <h3 style={{ margin: 0 }}>Tool Calls 信息</h3>
                      <div
                        style={{
                          backgroundColor: 'rgba(229,229,229,0.51)',
                          borderRadius: 8,
                          padding: 16,
                        }}
                      >
                        <pre
                          style={{
                            maxHeight: '100px',
                            overflowY: 'auto',
                            margin: 0,
                            wordWrap: 'break-word',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          Tool Name: {item.name} {'\n'}
                          Arguments: {JSON.stringify(item.arguments)}
                        </pre>
                      </div>
                      <Form.Item name={item.id}>
                        <Input.TextArea rows={4} placeholder="输入返回结果" />
                      </Form.Item>
                    </Flex>
                  </Form.Item>
                </Col>
              ))}
            </Row>
          )}
        </Form.List>
      </Form>
    </Flex>
  );
};

export default FunctionCallResponseEditor;
