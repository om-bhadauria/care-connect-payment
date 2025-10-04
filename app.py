from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

import os
import sys

# Add current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from gemini_service import gemini_ai_service
    print("✅ Gemini service imported successfully")
except ImportError as e:
    print(f"❌ Failed to import gemini_service: {e}")
    print(f"📁 Current directory: {os.path.dirname(os.path.abspath(__file__))}")
    print(f"📁 Files in directory: {os.listdir(os.path.dirname(os.path.abspath(__file__)))}")
    


app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///careconnect.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# # User Model
# class User(UserMixin, db.Model):
#     id = db.Column(db.Integer, primary_key=True)
#     name = db.Column(db.String(100), nullable=False)
#     email = db.Column(db.String(100), unique=True, nullable=False)
#     password = db.Column(db.String(200), nullable=False)
#     role = db.Column(db.String(20), default='patient')  # 'patient' or 'doctor'
#     created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
#     # For doctors
#     specialty = db.Column(db.String(100))
#     phone = db.Column(db.String(20))
#     location = db.Column(db.String(100))
#     bio = db.Column(db.Text)


# Update User Model to include wallet
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), default='patient')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    specialty = db.Column(db.String(100))
    phone = db.Column(db.String(20))
    location = db.Column(db.String(100))
    bio = db.Column(db.Text)
    
    # Wallet fields
    wallet_balance = db.Column(db.Float, default=0.0)
    
    # Relationships
    transactions = db.relationship('Transaction', backref='user', lazy=True)
    appointments = db.relationship('Appointment', backref='user', lazy=True)

# Transaction Model
class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    transaction_type = db.Column(db.String(20), nullable=False)  # 'credit', 'debit', 'payment'
    status = db.Column(db.String(20), default='pending')  # 'pending', 'completed', 'failed'
    razorpay_order_id = db.Column(db.String(100))
    razorpay_payment_id = db.Column(db.String(100))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# Appointment Model (if not already exists)
class Appointment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    doctor_id = db.Column(db.Integer, nullable=False)
    doctor_name = db.Column(db.String(100), nullable=False)
    appointment_date = db.Column(db.DateTime, nullable=False)
    amount = db.Column(db.Float, default=0.0)
    status = db.Column(db.String(20), default='scheduled')  # 'scheduled', 'completed', 'cancelled'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)




@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Create tables before first request
@app.before_request
def create_tables():
    db.create_all()

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/doctors')
def doctors():
    return render_template('doctors.html')

@app.route('/symptom-checker')
def symptom_checker():
    return render_template('symptom_checker.html')

@app.route('/health-feed')
def health_feed():
    return render_template('health_feed.html')

@app.route('/my-schedule')
@login_required
def my_schedule():
    return render_template('my_schedule.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/profile')
@login_required
def profile():
    return render_template('profile.html')

@app.route('/api/check-auth')
def check_auth():
    return jsonify({'authenticated': current_user.is_authenticated})


# Wallet and Payment Routes
@app.route('/wallet')
@login_required
def wallet():
    # Get recent transactions
    transactions = Transaction.query.filter_by(user_id=current_user.id).order_by(Transaction.created_at.desc()).limit(10).all()
    return render_template('wallet.html', 
                         wallet_balance=current_user.wallet_balance,
                         transactions=transactions)

@app.route('/api/create-payment-order', methods=['POST'])
@login_required
def create_payment_order():
    data = request.get_json()
    amount = data.get('amount', 0)
    
    if amount < 10:  # Minimum amount ₹10
        return jsonify({'error': 'Minimum amount is ₹10'}), 400
    
    try:
        # Convert amount to paise (Razorpay uses paise for INR)
        amount_in_paise = int(amount * 100)
        
        # Create Razorpay order
        order_data = {
            'amount': amount_in_paise,
            'currency': 'INR',
            'receipt': f'receipt_{current_user.id}_{datetime.utcnow().timestamp()}',
            'payment_capture': 1,
            'notes': {
                'user_id': current_user.id,
                'purpose': 'wallet_topup'
            }
        }
        
        # order = razorpay_client.order.create(data=order_data)
        
        # Create transaction record
        transaction = Transaction(
            user_id=current_user.id,
            amount=amount,
            transaction_type='credit',
            status='pending',
            # razorpay_order_id=order['id'],
            description=f'Wallet topup of ₹{amount}'
        )
        db.session.add(transaction)
        db.session.commit()
        
        return jsonify({
            'success': True,
            # 'order_id': order['id'],
            'amount': amount,
            'key': os.getenv('RAZORPAY_KEY_ID')
        })
        
    except Exception as e:
        print(f"Razorpay order creation error: {e}")
        return jsonify({'error': 'Payment order creation failed'}), 500

@app.route('/api/payment-success', methods=['POST'])
@login_required
def payment_success():
    data = request.get_json()
    razorpay_payment_id = data.get('razorpay_payment_id')
    razorpay_order_id = data.get('razorpay_order_id')
    razorpay_signature = data.get('razorpay_signature')
    
    try:
        # Verify payment signature
        params_dict = {
            'razorpay_order_id': razorpay_order_id,
            'razorpay_payment_id': razorpay_payment_id,
            'razorpay_signature': razorpay_signature
        }
        
        # razorpay_client.utility.verify_payment_signature(params_dict)
        
        # Update transaction status
        transaction = Transaction.query.filter_by(razorpay_order_id=razorpay_order_id).first()
        if transaction:
            transaction.status = 'completed'
            transaction.razorpay_payment_id = razorpay_payment_id
            
            # Update user wallet balance
            current_user.wallet_balance += transaction.amount
            
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': f'₹{transaction.amount} added to your wallet successfully!',
                'new_balance': current_user.wallet_balance
            })
        else:
            return jsonify({'error': 'Transaction not found'}), 404
            
    except Exception as e:
        print(f"Payment verification error: {e}")
        return jsonify({'error': 'Payment verification failed'}), 400

@app.route('/api/payment-failed', methods=['POST'])
@login_required
def payment_failed():
    data = request.get_json()
    razorpay_order_id = data.get('razorpay_order_id')
    
    try:
        # Update transaction status to failed
        transaction = Transaction.query.filter_by(razorpay_order_id=razorpay_order_id).first()
        if transaction:
            transaction.status = 'failed'
            db.session.commit()
            
        return jsonify({'success': True, 'message': 'Payment failed. Please try again.'})
        
    except Exception as e:
        print(f"Payment failure update error: {e}")
        return jsonify({'error': 'Failed to update payment status'}), 500

# Book appointment using wallet balance
@app.route('/api/book-appointment', methods=['POST'])
@login_required
def book_appointment():
    data = request.get_json()
    doctor_id = data.get('doctor_id')
    doctor_name = data.get('doctor_name')
    appointment_date = data.get('appointment_date')
    amount = data.get('amount', 500)  # Default ₹500
    
    if current_user.wallet_balance < amount:
        return jsonify({'error': 'Insufficient wallet balance'}), 400
    
    try:
        # Create appointment
        appointment = Appointment(
            user_id=current_user.id,
            doctor_id=doctor_id,
            doctor_name=doctor_name,
            appointment_date=datetime.fromisoformat(appointment_date),
            amount=amount,
            status='scheduled'
        )
        
        # Create debit transaction
        transaction = Transaction(
            user_id=current_user.id,
            amount=amount,
            transaction_type='debit',
            status='completed',
            description=f'Appointment with {doctor_name}'
        )
        
        # Update wallet balance
        current_user.wallet_balance -= amount
        
        db.session.add(appointment)
        db.session.add(transaction)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Appointment booked successfully! ₹{amount} deducted from wallet.',
            'new_balance': current_user.wallet_balance,
            'appointment_id': appointment.id
        })
        
    except Exception as e:
        print(f"Appointment booking error: {e}")
        return jsonify({'error': 'Appointment booking failed'}), 500






@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        remember = True if request.form.get('remember') else False
        
        user = User.query.filter_by(email=email).first()
        
        if not user or not check_password_hash(user.password, password):
            flash('Please check your login details and try again.', 'error')
            return redirect(url_for('login'))
            
        login_user(user, remember=remember)
        flash('Logged in successfully!', 'success')
        return redirect(url_for('dashboard'))
        
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form.get('name')
        email = request.form.get('email')
        password = request.form.get('password')
        
        user = User.query.filter_by(email=email).first()
        
        if user:
            flash('Email address already exists', 'error')
            return redirect(url_for('register'))
            
        new_user = User(
            name=name,
            email=email,
            password=generate_password_hash(password, method='pbkdf2:sha256'),
            role='patient'
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        flash('Account created successfully! Please log in.', 'success')
        return redirect(url_for('login'))
        
    return render_template('register.html')

@app.route('/doctor-register', methods=['GET', 'POST'])
def doctor_register():
    if request.method == 'POST':
        name = request.form.get('name')
        email = request.form.get('email')
        password = request.form.get('password')
        specialty = request.form.get('specialty')
        phone = request.form.get('phone')
        location = request.form.get('location')
        bio = request.form.get('bio')
        
        user = User.query.filter_by(email=email).first()
        
        if user:
            flash('Email address already exists', 'error')
            return redirect(url_for('doctor_register'))
            
        new_user = User(
            name=name,
            email=email,
            password=generate_password_hash(password, method='pbkdf2:sha256'),
            role='doctor',
            specialty=specialty,
            phone=phone,
            location=location,
            bio=bio
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        flash('Doctor registration submitted successfully! Please log in.', 'success')
        return redirect(url_for('login'))
        
    return render_template('doctor_register.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Logged out successfully!', 'info')
    return redirect(url_for('index'))

# API endpoint for symptom checker
# @app.route('/api/analyze-symptoms', methods=['POST'])
# def analyze_symptoms():
#     if not current_user.is_authenticated:
#         return jsonify({'error': 'Authentication required'}), 401
        
#     data = request.get_json()
#     symptoms = data.get('symptoms', '')
    
#     # Here you would integrate with your AI service
#     # For now, return a mock response
#     response = {
#         'analysis': f"Based on your symptoms: {symptoms}, I recommend consulting with a healthcare professional for proper diagnosis.",
#         'possible_conditions': ['Common Cold', 'Seasonal Allergies', 'Stress-related symptoms'],
#         'recommendations': ['Rest well', 'Stay hydrated', 'Monitor symptoms']
#     }
    
#     return jsonify(response)


@app.route('/api/analyze-symptoms', methods=['POST'])
@login_required
def analyze_symptoms():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Authentication required'}), 401
        
    data = request.get_json()
    symptoms = data.get('symptoms', '').strip()
    
    if not symptoms:
        return jsonify({'error': 'Please describe your symptoms'}), 400
    
    if len(symptoms) < 10:
        return jsonify({'error': 'Please provide more detailed symptoms (at least 10 characters)'}), 400

    try:
        # Use Gemini AI service
        result = gemini_ai_service.analyze_symptoms(symptoms)
        
        if result['success']:
            return jsonify({
                'success': True,
                'analysis': result['analysis'],
                'model_used': result.get('model_used', 'gemini-ai'),
                'timestamp': datetime.utcnow().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': result['error'],
                'analysis': result['analysis']
            }), 500
            
    except Exception as e:
        print(f"Error in symptom analysis: {e}")
        return jsonify({
            'success': False,
            'error': 'Service temporarily unavailable',
            'analysis': 'Our medical analysis service is currently unavailable. Please try again in a few minutes.'
        }), 503


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)