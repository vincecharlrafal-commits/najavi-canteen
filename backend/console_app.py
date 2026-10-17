"""Interactive console version of the School Canteen Ordering and Billing System."""

from canteen_logic import MENU, OrderError, calculate_order, checkout


def show_menu():
    print("\nNaJaVi School Canteen Menu")
    for product in MENU:
        print(f"{product['id']}. {product['name']} ({product['english_name']}) - PHP {product['price']}")
    print("Type 'done' when you have finished adding items.")


def get_customer_order(customer_number):
    items = []
    print(f"\nCustomer {customer_number}")
    show_menu()
    while True:
        choice = input("Enter item number or 'done': ").strip().lower()
        if choice == "done":
            if items:
                return items
            print("Please add at least one item before finishing the order.")
            continue
        try:
            product_id = int(choice)
        except ValueError:
            print("Enter a menu number or 'done'.")
            continue

        if not any(product["id"] == product_id for product in MENU):
            print("That item number is not on the menu.")
            continue

        try:
            quantity = int(input("Enter quantity: ").strip())
            # Reuse the same validation as the API before adding the item.
            calculate_order([{"id": product_id, "quantity": quantity}])
        except ValueError as error:
            print(error)
            continue
        items.append({"id": product_id, "quantity": quantity})
        print("Item added.")


def take_payment(total_due):
    while True:
        try:
            payment = int(input(f"Total due is PHP {total_due}. Cash received: PHP ").strip())
            if payment < 0:
                print("Payment cannot be negative.")
            elif payment < total_due:
                print(f"Insufficient payment. Please collect at least PHP {total_due - payment} more.")
            else:
                return payment
        except ValueError:
            print("Enter payment as a whole number of pesos.")


def print_receipt(receipt):
    print("\n----- NaJaVi Canteen Receipt -----")
    for item in receipt["items"]:
        print(f"{item['name']} x {item['quantity']} @ PHP {item['unitPrice']} = PHP {item['lineTotal']}")
    print(f"Subtotal: PHP {receipt['subtotal']}")
    print(f"Free-drink deduction: PHP {receipt['discount']}")
    if receipt["freeDrinks"]:
        print("Free drink awarded: 1")
    print(f"Total due: PHP {receipt['totalDue']}")
    print(f"Cash received: PHP {receipt['cashPaid']}")
    print(f"Change: PHP {receipt['change']}")
    print("----------------------------------")


def run_console():
    """Serve multiple customers and keep an in-memory end-of-day summary."""
    completed_orders = []
    customer_number = 1
    print("Welcome to the NaJaVi School Canteen Ordering and Billing System!")

    while True:
        items = get_customer_order(customer_number)
        order = calculate_order(items)
        payment = take_payment(order["totalDue"])
        receipt = checkout(items, payment)
        print_receipt(receipt)
        completed_orders.append(receipt)
        customer_number += 1

        while True:
            another = input("Serve another customer? (yes/no): ").strip().lower()
            if another in ("yes", "y"):
                break
            if another in ("no", "n"):
                print_end_of_day_summary(completed_orders)
                print("Thank you for using the canteen system.")
                return
            print("Please answer yes or no.")


def print_end_of_day_summary(completed_orders):
    total_sales = sum(order["totalDue"] for order in completed_orders)
    total_items = sum(item["quantity"] for order in completed_orders for item in order["items"])
    free_drinks = sum(order["freeDrinks"] for order in completed_orders)
    print("\n===== End-of-Day Summary =====")
    print(f"Customers served: {len(completed_orders)}")
    print(f"Items sold: {total_items}")
    print(f"Free drinks awarded: {free_drinks}")
    print(f"Total sales collected: PHP {total_sales}")
    print("==============================")


if __name__ == "__main__":
    run_console()
