import os
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
CORS(app)

DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://postgres:postgres@localhost:5432/postgres'
)


def get_db():
    return psycopg2.connect(DATABASE_URL)


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS members (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL REFERENCES groups(id),
            name TEXT NOT NULL
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL REFERENCES groups(id),
            description TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            payer_id TEXT NOT NULL REFERENCES members(id),
            created_at TIMESTAMP DEFAULT NOW()
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS expense_splits (
            expense_id TEXT NOT NULL REFERENCES expenses(id),
            member_id TEXT NOT NULL REFERENCES members(id),
            PRIMARY KEY (expense_id, member_id)
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS settlements (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL REFERENCES groups(id),
            payer_id TEXT NOT NULL REFERENCES members(id),
            payee_id TEXT NOT NULL REFERENCES members(id),
            amount NUMERIC NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    ''')
    conn.commit()
    cur.close()
    conn.close()


def compute_balances(group_id, conn):
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute('SELECT id, name FROM members WHERE group_id = %s', (group_id,))
    members = {row['id']: row['name'] for row in cur.fetchall()}
    balances = {mid: 0.0 for mid in members}

    cur.execute('''
        SELECT e.id, e.amount::float, e.payer_id,
               array_agg(es.member_id) AS split_members
        FROM expenses e
        JOIN expense_splits es ON e.id = es.expense_id
        WHERE e.group_id = %s
        GROUP BY e.id, e.amount, e.payer_id
    ''', (group_id,))
    for expense in cur.fetchall():
        split_members = expense['split_members']
        amount = float(expense['amount'])
        per_person = amount / len(split_members)
        balances[expense['payer_id']] += amount
        for mid in split_members:
            balances[mid] -= per_person

    cur.execute('''
        SELECT payer_id, payee_id, amount::float
        FROM settlements WHERE group_id = %s
    ''', (group_id,))
    for s in cur.fetchall():
        balances[s['payer_id']] += float(s['amount'])
        balances[s['payee_id']] -= float(s['amount'])

    cur.close()
    return balances, members


def minimize_transactions(balances, members):
    creditors = sorted(
        [(mid, round(bal, 2)) for mid, bal in balances.items() if bal > 0.005],
        key=lambda x: -x[1]
    )
    debtors = sorted(
        [(mid, round(-bal, 2)) for mid, bal in balances.items() if bal < -0.005],
        key=lambda x: -x[1]
    )

    creditors = [list(x) for x in creditors]
    debtors = [list(x) for x in debtors]

    transactions = []
    i, j = 0, 0
    while i < len(creditors) and j < len(debtors):
        cid, camt = creditors[i]
        did, damt = debtors[j]
        amount = min(camt, damt)
        transactions.append({
            'debtor_name': members[did],
            'creditor_name': members[cid],
            'amount': round(amount, 2)
        })
        creditors[i][1] = round(camt - amount, 10)
        debtors[j][1] = round(damt - amount, 10)
        if creditors[i][1] < 0.005:
            i += 1
        if debtors[j][1] < 0.005:
            j += 1

    return transactions


@app.route('/api/groups', methods=['POST'])
def create_group():
    data = request.json
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        group_id = str(uuid.uuid4()).replace('-', '')[:12]
        cur.execute('INSERT INTO groups (id, name) VALUES (%s, %s)', (group_id, data['name']))
        for member_name in data['members']:
            member_id = str(uuid.uuid4())
            cur.execute(
                'INSERT INTO members (id, group_id, name) VALUES (%s, %s, %s)',
                (member_id, group_id, member_name)
            )
        conn.commit()
        cur.close()
        return jsonify({'id': group_id})
    finally:
        conn.close()


@app.route('/api/groups/<group_id>', methods=['GET'])
def get_group(group_id):
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute('SELECT id, name FROM groups WHERE id = %s', (group_id,))
        group = cur.fetchone()
        if not group:
            return jsonify({'error': 'Not found'}), 404

        cur.execute('SELECT id, name FROM members WHERE group_id = %s ORDER BY name', (group_id,))
        members_rows = cur.fetchall()
        member_map = {m['id']: m['name'] for m in members_rows}

        # Collect activity in chronological order
        cur.execute('''
            SELECT 'expense' AS type, id, description, amount::float, payer_id, NULL AS payee_id, created_at
            FROM expenses WHERE group_id = %s
            UNION ALL
            SELECT 'settlement', id, NULL, amount::float, payer_id, payee_id, created_at
            FROM settlements WHERE group_id = %s
            ORDER BY created_at
        ''', (group_id, group_id))
        activity_raw = cur.fetchall()

        activity = []
        for item in activity_raw:
            if item['type'] == 'expense':
                cur.execute(
                    'SELECT member_id FROM expense_splits WHERE expense_id = %s',
                    (item['id'],)
                )
                split_names = [member_map.get(row['member_id'], '') for row in cur.fetchall()]
                activity.append({
                    'type': 'expense',
                    'id': item['id'],
                    'description': item['description'],
                    'amount': item['amount'],
                    'payer_name': member_map.get(item['payer_id'], ''),
                    'split_among': split_names,
                })
            else:
                activity.append({
                    'type': 'settlement',
                    'id': item['id'],
                    'amount': item['amount'],
                    'payer_name': member_map.get(item['payer_id'], ''),
                    'payee_name': member_map.get(item['payee_id'], ''),
                })

        balances, members_dict = compute_balances(group_id, conn)
        debts = minimize_transactions(balances, members_dict)

        cur.close()
        return jsonify({
            'id': group['id'],
            'name': group['name'],
            'members': [{'id': m['id'], 'name': m['name']} for m in members_rows],
            'debts': debts,
            'activity': activity,
        })
    finally:
        conn.close()


@app.route('/api/groups/<group_id>/expenses', methods=['POST'])
def add_expense(group_id):
    data = request.json
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            'SELECT id FROM members WHERE group_id = %s AND name = %s',
            (group_id, data['payer_name'])
        )
        payer = cur.fetchone()
        if not payer:
            return jsonify({'error': 'Payer not found'}), 400

        expense_id = str(uuid.uuid4())
        cur.execute('''
            INSERT INTO expenses (id, group_id, description, amount, payer_id)
            VALUES (%s, %s, %s, %s, %s)
        ''', (expense_id, group_id, data['description'], data['amount'], payer['id']))

        for member_name in data['split_among']:
            cur.execute(
                'SELECT id FROM members WHERE group_id = %s AND name = %s',
                (group_id, member_name)
            )
            member = cur.fetchone()
            if member:
                cur.execute(
                    'INSERT INTO expense_splits (expense_id, member_id) VALUES (%s, %s)',
                    (expense_id, member['id'])
                )

        conn.commit()
        cur.close()
        return jsonify({'id': expense_id})
    finally:
        conn.close()


@app.route('/api/groups/<group_id>/settlements', methods=['POST'])
def add_settlement(group_id):
    data = request.json
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            'SELECT id FROM members WHERE group_id = %s AND name = %s',
            (group_id, data['payer_name'])
        )
        payer = cur.fetchone()
        cur.execute(
            'SELECT id FROM members WHERE group_id = %s AND name = %s',
            (group_id, data['payee_name'])
        )
        payee = cur.fetchone()

        if not payer or not payee:
            return jsonify({'error': 'Member not found'}), 400

        settlement_id = str(uuid.uuid4())
        cur.execute('''
            INSERT INTO settlements (id, group_id, payer_id, payee_id, amount)
            VALUES (%s, %s, %s, %s, %s)
        ''', (settlement_id, group_id, payer['id'], payee['id'], data['amount']))

        conn.commit()
        cur.close()
        return jsonify({'id': settlement_id})
    finally:
        conn.close()


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=3001)
