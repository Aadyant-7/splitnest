# SplitNest user guide

SplitNest helps a group record shared expenses and see how much each person has
paid or owes. All amounts are in Indian rupees (INR). It keeps expense records;
it does not transfer money or connect to your bank account.

## 1. Open the app and create an account

1. Open the [public demo](https://splitnest-expenses.onrender.com/), or
   [your local app](http://127.0.0.1:8080/) while it is running. Free hosting may
   take several minutes to wake up. Use synthetic expenses and sample files.
2. The introduction explains what the app does. Choose **Create your account**.
3. Enter your name, email address and a password with at least eight characters.
4. Choose **Create account**. The app signs you in after registration.

Use **Sign in** with the same email and password when you return. **Show** and
**Hide** let you check the password you are entering. An email address can have
only one account. Email verification and password reset are not available.

For a demo with several people, each person needs an account. Use separate
browser profiles or separate browser contexts to act as different people.
Ordinary tabs in one browser profile share the same signed-in account.

## 2. Find your way around

After registration or sign-in, **Home** is the starting page. It shows your real
groups and useful next actions, with a diagram explaining the expense-sharing
workflow. A new account starts with no groups; the page explains how to create
one or be added to someone else's group.

**Groups you belong to** counts your saved memberships. **Groups you manage**
counts those where you are admin. Choose **Create a group** to go directly to
the group-name form, or open one of the group cards. **View all groups** opens
the complete list.

Use the top navigation:

| Page | When to use it |
|---|---|
| Home | Choose a group, see where to start and follow the workflow |
| My groups | Browse your groups or create a new one |
| Guide | Read instructions and examples without leaving the app |

The SplitNest name returns to Home. The public introduction at `/` is shown
when signed out; opening that address while signed in takes you to Home.
Group counts come from your saved memberships. The home diagram explains the
workflow; it is not a record of your spending or payments.

## 3. Create or open a group

On **Your groups**, enter a **Group name** under **Create a group**, then choose
**Create group**. For example, create a group called *Apartment expenses*.

You become the group's **Admin**. Open a group by selecting its name. You only
see groups you belong to. **My groups** in the top navigation or **All groups**
above a group's name takes you back to the list.

Inside a group, use these tabs:

| Tab | What you can do |
|---|---|
| Overview | Check each person's paid amount, share and balance |
| Expenses | Add expenses, inspect saved shares and delete permitted entries |
| Members | See the group members; admins can add or remove people |
| Imports | Upload a statement and check its processing result |
| Budgets | View category limits and alerts; admins can change limits |

With a keyboard, Tab to the section tabs, then use the arrow keys to move between
them. Home and End select the first and last section. Tab again to enter the
selected section's controls.

You can bookmark or copy the address of a section. For example, a group address
ending in `?tab=expenses` opens its Expenses section. Refresh, Back and Forward
preserve the section. The person opening a link must sign in and belong to that
group; copying a link does not give someone access.

## 4. Add and remove members

As the admin, open **Members**, enter another registered user's email, and add
them. They immediately become a **Member** and can see the group when they sign
in. They must create their account first; this action does not send an invitation.

Admins can remove members. A removed person loses access to the group, but their
previous expenses and shares remain in its financial history. The last admin
cannot be removed.

| Action | Admin | Member |
|---|---|---|
| View the group's records | Yes | Yes |
| Add expenses and upload statements | Yes | Yes |
| Add or remove members | Yes | No |
| Change category budgets | Yes | No |
| Delete an expense | Any expense in the group | Only an expense they created |

## 5. Add an expense

1. Open **Expenses**.
2. Enter the **Amount (INR)**, such as `100.00`.
3. Enter a **Description**, such as `Dinner`.
4. Choose the **Category** and **Expense date**.
5. Under **Paid by**, choose the current member who paid.
6. Choose **Add expense**.

**Expense date** starts with today's date on your device. Change it when recording
an earlier purchase; it does not have to be the day you enter the record.

Amounts must be positive and have no more than two decimal places. Categories
are Food, Groceries, Rent, Utilities, Travel, Entertainment, Shopping and Other.

Every expense is split equally among **all current group members**, including
the payer. You cannot choose a smaller set of participants or unequal shares.
For `100.00` shared by three people, the saved shares are `33.34`, `33.33` and
`33.33`. A consistent member order determines who receives the extra paisa.

The **Paid by** person and the person entering the record can be different.
Deletion permission follows who **created** the record, rather than who paid.

### Review or delete an expense

The list shows newly entered records first, with page controls for older entries.
Expand **Stored shares** on an expense to see each person's saved amount.
Adding or removing a member later does not rewrite an old split.
On a phone, expenses and members appear as labeled cards with the same information
and available actions as the wider layout.

If you are allowed to delete an expense, choose **Delete** and accept the
confirmation. The expense is removed and balances are updated. There is no
expense-edit form; to correct an entry, delete it if permitted and add it again.

## 6. Understand the balances

Open **Overview** to see:

- **Paid:** how much that person has paid for the group.
- **Share:** how much of the recorded spending belongs to that person.
- **Net balance:** paid minus share. A positive value means they are owed money;
  a negative value means they owe money; zero means their recorded position is even.

For example, if A pays `900.00` for three people, each share is `300.00`.
A's net balance is `+600.00`; B's and C's are `-300.00` each.

Former members can still appear when they have financial history. Balances do
not make payments, record a repayment or calculate a person-to-person payment plan.

## 7. Import several expenses from a statement

Open **Imports**, choose a CSV or XLSX file up to **5 MiB** (about 5.2 MB), and upload it.
The file needs the columns `date`, `description` and `amount`.
Choose **Download sample CSV** for a small file with the required columns. Open
or edit a copy before uploading; uploading it creates real expense records.

A small CSV example:

```csv
date,description,amount
2026-10-19,SWIGGY dinner,600.00
2026-10-19,UBER ride,150.00
```

Use dates in `YYYY-MM-DD` format and plain positive amounts such as `600.00`.
For XLSX, use one worksheet, these column headers, and ordinary values rather
than formulas. A bank's original export may need rearranging to match this format.

The upload is processed in the background:

| Status | Meaning |
|---|---|
| Pending | The upload is saved and waiting to start |
| Processing | The app is reading the rows and preparing expenses |
| Completed | Valid rows have been saved; check the imported and invalid counts |
| Failed | Processing could not finish; read the error before trying another file |

Each valid row becomes an expense paid by **the uploader**, split among the group
members present when the expenses are saved. Invalid rows are skipped. A file
with no valid rows fails. Descriptions are categorized using keywords: SWIGGY
matches Food, UBER matches Travel, and unmatched descriptions become Other.

The screen checks progress automatically for up to two minutes. If it stops
checking, choose **Check status again**. The background job can continue while
the screen is waiting. Returning to Imports in the same browser tab restores the
latest upload's actual result, including completed or failed uploads. This is
tracked separately for each account and group; there is no full import-history list.

Check the result before uploading again: **uploading the same file again can
create duplicate expenses**. Uploads are limited to ten requests per user in an
hourly window.

## 8. Set budgets and read alerts

As admin, open **Budgets**, select a **Category**, enter **Monthly limit (INR)**,
and choose **Save monthly limit**. Saving the same category again changes
its limit. Members can view limits and alerts but cannot change them.

The saved limit is reused each month until changed. The app checks current-month
spending once daily at **00:00 UTC (5:30 AM India time)** while it is running.
If spending is **greater than** the limit, it saves an alert for that category
and month. Spending exactly the limit does not trigger an alert.

Saving a budget does not immediately run the check. Alerts appear in the app;
there are no email or push notifications. An alert is a saved record of an
earlier check: later budget changes or expense deletions do not rewrite it.
The screen does not show a live spending-progress total.

## 9. Sign out and return later

Choose **Sign out** in the top bar. Other open tabs in the same browser profile
also sign out. Signing out does not delete your account or expenses.

Your groups and records are saved in PostgreSQL, separately from this browser.
The public demo uses a hosted database; you do not need Docker to use its website.
The local version uses your computer's database volume, which must be kept to
preserve its data. Public and local accounts/data are separate.

## 10. Common problems

| What you see | What to do |
|---|---|
| Email already registered | Sign in with that account or use another email |
| User not found when adding a member | Ask them to register first and check their email spelling |
| Group unavailable | Check the address and whether you are still a member |
| No budget or member-management controls | Those actions require the group's admin |
| No Delete button on an expense | Only its creator or a group admin can delete it |
| Too many login attempts | Wait for the displayed retry period; login allows five attempts per email/IP in a minute window |
| Upload failed or rows were skipped | Check the file format, required columns, dates, amounts and result message |
| No budget alert after saving a limit | Alerts require the daily check, the app to be awake, and spending above the limit |
| Public demo is loading | Allow several minutes for the free service to wake up; quota exhaustion can also suspend it |
| Local app cannot connect or load records | Check that Docker and the local application are running, then retry |

Group renaming/deletion, member-role changes, payments, unequal splits, password
reset and bank synchronization are not available in this version.

For startup commands, see [Setup](setup.md). For a guided demonstration, see
[Demo](demo.md).
