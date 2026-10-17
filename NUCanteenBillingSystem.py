
# NU Canteen Billing System

customers = 0
total_sales = 0
free_drinks = 0
again = "yes"

# Repeat while there are more customers
while again == "yes":
    customers = customers + 1
    total = 0

    print("==================================")
    print("      NU MAIN CANTEEN MENU")
    print("         Customer #", customers)
    print("==================================")
    print(" Kanin ................ P15")
    print(" Ulam ................. P35")
    print(" Softdrinks ........... P15")
    print(" Ice Cream ............ P10")
    print("----------------------------------")
    print(" P75 or more = free drink (P15)")
    print(" Type 'done' to finish your order")
    print("==================================")
    print()

    # Add items until the customer types done
    while True:
        item = input("Enter item: ").strip().lower()
              
        if item == "done":
            break
        elif item == "kanin":
            price = 15
        elif item == "ulam":
            price = 35
        elif item == "softdrinks":
            price = 15
        elif item == "ice cream":
            price = 10
        else:
            print("  >> Walang ganun, busseng!")
            print()
            continue

        qty = int(input("How many? "))
        total = total + price * qty

        print("  >> Added " + str(qty) + " x " + item +
              " = P" + str(price * qty))
        print("  >> Running total: P" + str(total))
        print()

    print("----------------------------------")

    if total == 0:
        print("No order was made.")
        customers = customers - 1
    else:
        subtotal = total
        discount = 0

        if total >= 75:
            discount = 15
            total = total - discount
            free_drinks = free_drinks + 1
            print()
            print("You got a free drink! (P15)")

        print("TOTAL TO PAY: P" + str(total))
        print()

        paid = int(input("Enter payment: P"))

        while paid < total:
            balance = total - paid
            print("  >> Kulang 'to, busseng! Remaining: P" + str(balance))
            more = int(input("Enter additional payment: P"))
            paid = paid + more

        change = paid - total

        print()
        print("==================================")
        print("              RESIBO")
        print("==================================")
        print(" Subtotal ............ P" + str(subtotal))

        if discount > 0:
            print(" Free drink .......... -P" + str(discount))

        print(" TOTAL ............... P" + str(total))
        print("----------------------------------")
        print(" Paid ................ P" + str(paid))
        print(" Change .............. P" + str(change))
        print("==================================")
        print("       Salamat, busseng!")
        print("==================================")

        total_sales = total_sales + total

    print()
    again = input("Next customer? (yes/no): ")
    again = again.lower()

print()
print("==================================")
print("            END OF DAY")
print("==================================")
print(" Customers served .... " + str(customers))
print(" Free drinks given ... " + str(free_drinks))
print(" Total sales ......... P" + str(total_sales))
print("==================================")
