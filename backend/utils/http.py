from flask import jsonify


# TODO: Better file name?
def bad_request(msg: str):
    return jsonify({"error": msg}), 400


def not_found(msg: str = "Not found"):
    return jsonify({"error": msg}), 404


def ok(payload, status=200):
    return jsonify(payload), status
