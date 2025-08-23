# xzt-wall

数据管理软件

- https://www.pgadmin.org/download/

###  推荐 Railway 部署

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.com?referralCode=tcq233)


## 创建数据库表
```
-- 删除旧的 messages 表，如果不存在则忽略
DROP TABLE IF EXISTS public.messages;

-- 新建 messages 表，id 为自增主键，created_at 默认为当前时间
CREATE TABLE public.messages (
  id SERIAL PRIMARY KEY,
  username TEXT,
  content TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```
## 添加测试留言
```
INSERT INTO public.messages (username, content, created_at)
VALUES ('小纸条', '第一次使用留言墙，大家好！', '2025-08-17 18:30:00');
```

## ENV 配置
创建数据库 Deploy PostgreSQL
复制链接地址 Connect to Postgres - Connection URL

粘贴到 xzt-wall Variables ENV
```
DATABASE_URL="postgresql://postgres:xxx@xx:52567/railway"
```
