from flask import jsonify


def bad_request(msg: str, status: int = 400):
    return jsonify({"error": msg}), status


def unauthorized(msg: str = "Unauthorized"):
    return jsonify({"error": msg}), 401


def not_found(msg: str = "Not found"):
    return jsonify({"error": msg}), 404


def ok(payload, status=200):
    return jsonify(payload), status


def internal_error(msg: str = "Internal server error", status: int = 500):
    return jsonify({"error": msg}), status
