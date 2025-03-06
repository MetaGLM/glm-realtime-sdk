// 自定义tools，目前搜索是内部支持的
// 这里的tools可以用于测试触发
export const tools: Record<string, object> = {
  searchEngine: {
    type: 'function',
    name: 'search_engine',
    description: '基于给定的查询执行通用搜索',
    parameters: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: '搜索查询',
        },
      },
      required: ['q'],
    },
  },
  GetAndRandomSelectParticipants: {
    type: 'function',
    name: 'GetAndRandomSelectParticipants',
    description: '获取参会嘉宾名单并随机选择指定数量的嘉宾',
    parameters: {
      type: 'object',
      properties: {
        number: {
          type: 'integer',
          description: '需要选择的嘉宾数量',
        },
      },
      required: ['number'],
    },
  },
  // 触发话术：给张三和李四打电话
  PhoneCall: {
    type: 'function',
    name: 'PhoneCall',
    description: '对选中的嘉宾发起电话呼叫',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '要呼叫的嘉宾姓名',
        },
      },
      required: ['name'],
    },
  },
};
