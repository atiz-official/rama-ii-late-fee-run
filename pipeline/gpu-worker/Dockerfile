FROM nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04

ARG SAM2_COMMIT=2b90b9f5ceec907a1c18123530e92e794ad901a4
ARG VACE_COMMIT=48eb44f1c4be87cc65a98bff985a26976841e9f3
ARG WAN_COMMIT=9737cba9c1c3c4d04b33fcad41c111989865d315

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models/huggingface \
    TORCH_HOME=/models/torch \
    VACE_ROOT=/opt/VACE \
    PYTHONPATH=/opt/scene-compiler

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python3.10-dev build-essential ninja-build git ffmpeg ca-certificates libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN python3.10 -m pip install --upgrade pip setuptools wheel \
    && python3.10 -m pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu124

RUN git clone https://github.com/facebookresearch/sam2.git /opt/sam2 \
    && git -C /opt/sam2 checkout ${SAM2_COMMIT} \
    && python3.10 -m pip install -e /opt/sam2

RUN git clone https://github.com/ali-vilab/VACE.git /opt/VACE \
    && git -C /opt/VACE checkout ${VACE_COMMIT} \
    && grep -v '^flash_attn' /opt/VACE/requirements/framework.txt > /tmp/vace-framework.txt \
    && python3.10 -m pip install -r /tmp/vace-framework.txt \
    && python3.10 -m pip install flash-attn --no-build-isolation \
    && python3.10 -m pip install "wan @ git+https://github.com/Wan-Video/Wan2.1.git@${WAN_COMMIT}"

COPY requirements.txt /opt/scene-compiler/requirements.txt
RUN python3.10 -m pip install -r /opt/scene-compiler/requirements.txt

COPY scene_compiler /opt/scene-compiler/scene_compiler
WORKDIR /workspace
ENTRYPOINT ["python3.10", "-m", "scene_compiler.main"]
