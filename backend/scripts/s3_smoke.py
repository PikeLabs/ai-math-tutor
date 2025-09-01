# backend/scripts/s3_smoke.py
import os, tempfile, time
from lib.aws import (
    upload_file,
    delete_file,
    build_key,
    presigned_get_url,
    public_url,
    s3_client,
    S3_BUCKET_NAME,
)


def main():
    fd, path = tempfile.mkstemp()
    os.write(fd, b"hello s3 smoke")
    os.close(fd)

    key = build_key("smoke-" + str(int(time.time())), "hello.txt")
    upload_file(path, key, content_type="text/plain", encrypt=False)
    print("OK upload:", f"s3://{S3_BUCKET_NAME}/{key}")
    print("presigned:", presigned_get_url(key, 60))
    print("public:", public_url(key))

    head = s3_client().head_object(Bucket=S3_BUCKET_NAME, Key=key)
    print("head content-length:", head["ContentLength"])

    delete_file(key)
    print("OK delete")


if __name__ == "__main__":
    main()
