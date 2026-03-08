import asyncio
from loguru import logger
from database import init_db
from scheduler import run_24h_verification

async def main():
    logger.info("GitHub Action: 데이터베이스 연결 및 초기화...")
    await init_db()
    
    logger.info("GitHub Action: 24시간 카운팅 완료된 항목 일괄 검증 작업 시작...")
    await run_24h_verification()
    
    logger.info("GitHub Action: 모든 크롤링 검증 사이클이 종료되었습니다.")

if __name__ == "__main__":
    asyncio.run(main())
