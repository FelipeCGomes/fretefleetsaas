import { auth, db } from '../firebaseConfig.js';
import {
    onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
    deleteUser, EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    doc, getDoc, setDoc, updateDoc, collection, deleteDoc, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class AuthService {
    constructor(authStateCallback) {
        this.currentUser = null;
        this.currentTeamId = null;
        this.authStateCallback = authStateCallback;
        this.init();
    }

    init() {
        onAuthStateChanged(auth, async (user) => {
            if (user) { await this.carregarPerfilInterno(user); }
            else { this.currentUser = null; this.currentTeamId = null; }
            if (this.authStateCallback) this.authStateCallback(this.currentUser);
        });
    }

    async carregarPerfilInterno(user) {
        try {
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
                this.currentUser = { ...user, ...docSnap.data() };
                this.currentTeamId = this.currentUser.teamId;
            } else {
                await this.vincularUsuarioAoTime(user);
                const newSnap = await getDoc(userRef);
                if (newSnap.exists()) { this.currentUser = { ...user, ...newSnap.data() }; this.currentTeamId = this.currentUser.teamId; }
            }
        } catch (e) { this.currentUser = user; }
    }

    async refreshUser() {
        const user = auth.currentUser;
        if (!user) return null;
        await this.carregarPerfilInterno(user);
        return this.currentUser;
    }

    async loginGoogle() {
        const provider = new GoogleAuthProvider();
        try { const result = await signInWithPopup(auth, provider); return result.user; } catch (error) { throw error; }
    }

    async loginEmail(email, password) {
        try { const result = await signInWithEmailAndPassword(auth, email, password); return result.user; }
        catch (error) { throw new Error("Erro ao entrar. Verifique credenciais."); }
    }

    async register(email, password, name, company, role) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await updateProfile(user, { displayName: name });
            await this.vincularUsuarioAoTime(user, company, role);
            return user;
        } catch (error) { throw new Error("Erro ao registrar: " + error.message); }
    }

    async logout() { await signOut(auth); window.location.reload(); }

    async deleteAccount(password) {
        const user = auth.currentUser;
        if (!user) throw new Error("Não autenticado.");
        try { await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password)); } catch (e) { throw new Error("Senha incorreta."); }

        if (this.currentTeamId) {
            const teamRef = doc(db, "teams", this.currentTeamId);
            const teamSnap = await getDoc(teamRef);
            if (teamSnap.exists()) {
                const teamData = teamSnap.data();
                if (teamData.ownerId === user.uid && teamData.members && teamData.members.length > 1) {
                    throw new Error("Você é dono da equipe com outros membros. Transfira a liderança antes.");
                }
                if (teamData.ownerId === user.uid) await deleteDoc(teamRef);
                else {
                    const memberData = teamData.members.find(m => m.uid === user.uid);
                    if (memberData) await updateDoc(teamRef, { members: arrayRemove(memberData) });
                }
            }
        }
        await deleteDoc(doc(db, "users", user.uid));
        await deleteUser(user);
        return true;
    }

    async vincularUsuarioAoTime(user, companyNameDefault, roleDefault) {
        const inviteRef = doc(db, "invites", user.email);
        const inviteSnap = await getDoc(inviteRef);
        let teamId, company, role, jobTitle;

        if (inviteSnap.exists()) {
            const invite = inviteSnap.data();
            teamId = invite.teamId; company = invite.companyName; role = invite.role; jobTitle = invite.jobTitle;
            await deleteDoc(inviteRef);
        } else {
            const teamRef = doc(collection(db, "teams"));
            teamId = teamRef.id; company = companyNameDefault || "Minha Empresa"; role = "Admin"; jobTitle = roleDefault || "Gestor";
            await setDoc(teamRef, { id: teamId, name: company, ownerId: user.uid, createdAt: new Date().toISOString(), members: [{ uid: user.uid, name: user.displayName || "User", email: user.email, role: role, jobTitle: jobTitle }], geoCache: {}, preferencias: {} });
        }
        await setDoc(doc(db, "users", user.uid), { uid: user.uid, name: user.displayName || "User", email: user.email, company: company, role: role, jobTitle: jobTitle, teamId: teamId, createdAt: new Date().toISOString() });
    }
}