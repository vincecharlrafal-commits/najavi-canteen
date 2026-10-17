"""Flask JSON API for server-side NaJaVi Canteen quotes and checkout."""

import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import BadRequest, UnsupportedMediaType

from canteen_logic import OrderError, calculate_order, checkout, get_menu


def create_app():
    app = Flask(__name__)
    configured_origins = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173")
    allowed_origins = [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.get("/api/menu")
    def menu():
        return jsonify({"items": get_menu()})

    @app.post("/api/quote")
    def quote():
        payload = read_json_object()
        return jsonify(calculate_order(payload.get("items")))

    @app.post("/api/checkout")
    def checkout_order():
        payload = read_json_object()
        return jsonify({"receipt": checkout(payload.get("items"), payload.get("payment"))})

    @app.errorhandler(OrderError)
    def handle_order_error(error):
        return jsonify({"error": {"code": "invalid_order", "message": str(error)}}), 400

    @app.errorhandler(BadRequest)
    def handle_bad_request(_error):
        return jsonify({"error": {"code": "malformed_json", "message": "Request body must contain valid JSON."}}), 400

    @app.errorhandler(UnsupportedMediaType)
    def handle_unsupported_media(_error):
        return jsonify({"error": {"code": "json_required", "message": "Set Content-Type to application/json and send a JSON object."}}), 415

    return app


def read_json_object():
    payload = request.get_json()
    if not isinstance(payload, dict):
        raise OrderError("Request JSON must be an object.")
    return payload


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG") == "1")
