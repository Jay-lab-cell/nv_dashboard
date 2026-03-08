import asyncio
import asyncpg

async def test():
    try:
        conn = await asyncpg.connect(
            user="postgres.qqxdrvsxfwcpsjpinxod",
            password="nv_dashboard_pwd_2026!",
            database="postgres",
            host="aws-1-ap-northeast-2.pooler.supabase.com",
            port=6543,
            ssl="require"
        )
        print("Success!")
        await conn.close()
    except Exception as e:
        print("Failed:", e)

asyncio.run(test())
