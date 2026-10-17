"""Shared pricing and checkout rules for the NaJaVi Canteen programs."""

from copy import deepcopy


MENU = (
    {"id": 1, "name": "Kanin", "english_name": "Rice", "category": "Meal", "price": 15},
    {"id": 2, "name": "Ulam", "english_name": "Viand", "category": "Meal", "price": 35},
    {"id": 3, "name": "Softdrinks", "english_name": "Drink", "category": "Drink", "price": 15},
    {"id": 4, "name": "Ice Cream", "english_name": "Dessert", "category": "Dessert", "price": 10},
)
PROMOTION_THRESHOLD = 75
PROMOTION_DISCOUNT = 15
_PRODUCTS_BY_ID = {product["id"]: product for product in MENU}


class OrderError(ValueError):
    """Raised when an order or payment does not meet the program rules."""


def get_menu():
    """Return a copy so callers cannot accidentally change the catalog."""
    return deepcopy(list(MENU))


def _positive_integer(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise OrderError(f"{label} must be a positive integer.")
    return value


def calculate_order(items):
    """Price a list of {id, quantity} items using only the server catalog."""
    if not isinstance(items, list) or not items:
        raise OrderError("items must be a non-empty list.")

    lines = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise OrderError(f"Item {index} must be an object with id and quantity.")
        product_id = item.get("id")
        if isinstance(product_id, bool) or not isinstance(product_id, int):
            raise OrderError(f"Item {index} has a missing or invalid item id.")
        product = _PRODUCTS_BY_ID.get(product_id)
        if product is None:
            raise OrderError(f"Unknown item id: {product_id}.")
        quantity = _positive_integer(item.get("quantity"), f"Quantity for {product['name']}")
        line_total = product["price"] * quantity
        lines.append({
            "id": product["id"],
            "name": product["name"],
            "unitPrice": product["price"],
            "quantity": quantity,
            "lineTotal": line_total,
        })

    subtotal = sum(line["lineTotal"] for line in lines)
    discount = PROMOTION_DISCOUNT if subtotal >= PROMOTION_THRESHOLD else 0
    return {
        "items": lines,
        "subtotal": subtotal,
        "discount": discount,
        "totalDue": subtotal - discount,
        "freeDrinks": 1 if discount else 0,
    }


def checkout(items, payment):
    """Calculate an order and validate integer-peso payment; return its receipt."""
    order = calculate_order(items)
    if isinstance(payment, bool) or not isinstance(payment, int) or payment < 0:
        raise OrderError("Payment must be a non-negative whole number of pesos.")
    if payment < order["totalDue"]:
        raise OrderError(
            f"Insufficient payment. Amount still needed: {order['totalDue'] - payment} pesos."
        )
    return {**order, "cashPaid": payment, "change": payment - order["totalDue"]}
