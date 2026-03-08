#!/bin/bash
# AWS EC2 배포 및 셋업 스크립트 (Ubuntu 용)

echo "🔄 시스템 업데이트 및 필요 패키지 설치..."
sudo apt update -y
sudo apt install -y git curl

echo "💾 메모리 부족 방지를 위한 가상 메모리(Swap) 2GB 생성 중..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✔️ Swap 메모리 생성 완료!"
else
    echo "✔️ Swap 메모리가 이미 설정되어 있습니다."
fi

# Docker 설치
if ! command -v docker &> /dev/null
then
    echo "🐳 Docker 설치 중..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo systemctl start docker
    sudo systemctl enable docker
    # 현재 유저를 docker 그룹에 추가
    sudo usermod -aG docker ubuntu
    echo "✔️ Docker 설치 완료! 변경사항 적용을 위해 ssh 터미널을 나갔다가 다시 들어와야 할 수 있습니다."
fi

echo "⚙️ 레포지토리 클론 및 실행 준비"
# 레지포토리가 없으면 클론
if [ ! -d "nv_dashboard" ]; then
    git clone https://github.com/Jay-lab-cell/nv_dashboard.git
fi

cd nv_dashboard/backend
echo "🧱 백엔드 Docker 이미지 빌드 중 (이 작업은 보통 1~2분 정도 소요됩니다)..."
sudo docker build -t n-monitoring-backend .

echo "🚀 백엔드 컨테이너 실행 중..."
# 백그라운드 포트 8000로 실행 (이미 돌고 있다면 재시작 위해 제거)
sudo docker stop n-backend || true
sudo docker rm n-backend || true

# 백엔드 실행 (.env 변수는 추후 설정 필요할수 있음)
sudo docker run -d --name n-backend -p 8000:8000 \
  -e "SUPABASE_URL=postgresql://postgres.qqxdrvsxfwcpsjpinxod:N_Dashboard123\$\$@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres" \
  n-monitoring-backend

echo "✅ 모든 준비가 완료되었습니다! AWS의 8000 포트가 열려있는지 인바운드 규칙을 확인하세요."
