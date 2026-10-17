
import unittest

from app import create_app
from canteen_logic import MENU, OrderError, calculate_order, checkout, get_menu


class CanteenLogicTests(unittest.TestCase):
    def test_catalog_matches_frontend_ids_names_and_assignment_prices(self):
        self.assertEqual(
            [(item["id"], item["name"], item["price"]) for item in MENU],
            [(1, "Kanin", 15), (2, "Ulam", 35), (3, "Softdrinks", 15), (4, "Ice Cream", 10)],
        )

    def test_get_menu_returns_an_independent_copy(self):
        menu = get_menu()
        menu[0]["price"] = 999
        self.assertEqual(get_menu()[0]["price"], 15)

    def test_quote_uses_catalog_prices_and_ignores_browser_price_fields(self):
        quote = calculate_order([{"id": 1, "quantity": 1, "price": 999}, {"id": 2, "quantity": 1}])
        self.assertEqual(quote["subtotal"], 50)
        self.assertEqual(quote["discount"], 0)
        self.assertEqual(quote["totalDue"], 50)
        self.assertEqual(quote["items"][0]["lineTotal"], 15)

    def test_threshold_applies_one_fifteen_peso_deduction(self):
        quote = calculate_order([{"id": 2, "quantity": 1}, {"id": 4, "quantity": 4}])
        self.assertEqual((quote["subtotal"], quote["discount"], quote["totalDue"], quote["freeDrinks"]), (75, 15, 60, 1))

    def test_checkout_returns_payment_and_change(self):
        result = checkout([{"id": 2, "quantity": 1}], 50)
        self.assertEqual((result["totalDue"], result["cashPaid"], result["change"]), (35, 50, 15))

    def test_invalid_items_quantities_and_payment_are_rejected(self):
        invalid_orders = [None, [], [{"id": 99, "quantity": 1}], [{"id": 1, "quantity": 0}], [{"id": 1, "quantity": True}], [{"id": 1.5, "quantity": 1}]]
        for items in invalid_orders:
            with self.subTest(items=items), self.assertRaises(OrderError):
                calculate_order(items)
        for payment in (-1, 1.5, "35", True):
            with self.subTest(payment=payment), self.assertRaises(OrderError):
                checkout([{"id": 2, "quantity": 1}], payment)
        with self.assertRaisesRegex(OrderError, "Insufficient payment"):
            checkout([{"id": 2, "quantity": 1}], 34)


class CanteenApiTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()

    def test_health_and_menu_endpoints(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        menu_response = self.client.get("/api/menu")
        self.assertEqual(menu_response.status_code, 200)
        self.assertEqual([item["price"] for item in menu_response.json["items"]], [15, 35, 15, 10])

    def test_quote_and_checkout_endpoints(self):
        items = [{"id": 2, "quantity": 1}, {"id": 4, "quantity": 4}]
        quote = self.client.post("/api/quote", json={"items": items, "subtotal": 1}).json
        self.assertEqual((quote["subtotal"], quote["discount"], quote["totalDue"]), (75, 15, 60))
        response = self.client.post("/api/checkout", json={"items": items, "payment": 70})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["receipt"]["change"], 10)

    def test_api_reports_malformed_missing_unknown_and_insufficient_inputs(self):
        malformed = self.client.post("/api/quote", data="{", content_type="application/json")
        self.assertEqual(malformed.status_code, 400)
        self.assertEqual(malformed.json["error"]["code"], "malformed_json")
        missing = self.client.post("/api/quote", json={})
        self.assertEqual(missing.status_code, 400)
        unknown = self.client.post("/api/quote", json={"items": [{"id": 99, "quantity": 1}]})
        self.assertIn("Unknown item id", unknown.json["error"]["message"])
        insufficient = self.client.post("/api/checkout", json={"items": [{"id": 1, "quantity": 1}], "payment": 10})
        self.assertEqual(insufficient.status_code, 400)
        self.assertIn("Insufficient payment", insufficient.json["error"]["message"])

    def test_non_json_request_gets_clear_error(self):
        response = self.client.post("/api/quote", data="items")
        self.assertEqual(response.status_code, 415)
        self.assertEqual(response.json["error"]["code"], "json_required")


if __name__ == "__main__":
    unittest.main()
