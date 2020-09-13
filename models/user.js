import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: { type: String, required: true},
    displayName: {type: String, required: true},
    password: {type: String, required: true, minLength: 12}
});

const userModel = mongoose.Model('user', userSchema);

export default userModel;
