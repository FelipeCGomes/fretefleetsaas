import { auth, db } from '../firebaseConfig.js';
import {
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class AuthService {
    constructor(onUserChanged) {
        this.currentUser = null;
        this.currentTeamId = null;

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));

                    if (userDoc.exists()) {
                        // Usuário já cadastrado no banco: carrega dados
                        const userData = userDoc.data();
                        this.currentUser = { ...user, ...userData };
                        this.currentTeamId = userData.teamId;
                    } else {
                        // Primeiro login (Google) ou erro no registro
                        // Tenta realizar o vínculo inicial (cria empresa ou aceita convite)
                        await this.vincularUsuarioAoTime(user);

                        // Recarrega
                        const novoDoc = await getDoc(doc(db, "users", user.uid));
                        if (novoDoc.exists()) {
                            const userData = novoDoc.data();
                            this.currentUser = { ...user, ...userData };
                            this.currentTeamId = userData.teamId;
                        }
                    }
                    if (onUserChanged) onUserChanged(this.currentUser);
                } catch (e) {
                    console.error("Erro Auth:", e);
                    if (onUserChanged) onUserChanged(null);
                }
            } else {
                this.currentUser = null;
                this.currentTeamId = null;
                if (onUserChanged) onUserChanged(null);
            }
        });
    }

    // --- LÓGICA DE VÍNCULO INTELIGENTE ---
    async vincularUsuarioAoTime(user, formCompanyName = null, formRole = null) {
        // 1. Verifica se existe CONVITE para este email
        const inviteRef = doc(db, "invites", user.email);
        const inviteSnap = await getDoc(inviteRef);

        let teamId, companyName, role;

        if (inviteSnap.exists()) {
            // ACEITA CONVITE: Entra na equipe existente
            const invite = inviteSnap.data();
            teamId = invite.teamId;
            companyName = invite.companyName;
            role = invite.role;
            console.log(`Convite encontrado! Entrando na equipe: ${companyName}`);
        } else {
            // CRIA NOVA EQUIPE: Usuário é dono
            teamId = `team_${user.uid}`;
            companyName = formCompanyName || "Minha Empresa";
            role = formRole || "Admin";

            // Cria o documento da equipe
            await setDoc(doc(db, "teams", teamId), {
                name: companyName,
                owner: user.uid,
                createdAt: new Date().toISOString(),
                members: [], // Lista de membros adicionais
                frota: [],
                locais: [],
                config: {}
            });
        }

        // Cria o perfil do usuário vinculado ao time decidido acima
        await setDoc(doc(db, "users", user.uid), {
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            company: companyName,
            role: role,
            teamId: teamId
        });
    }

    async register(email, password, name, companyName, role) {
        // Cria Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name });

        // Vincula (Cria empresa ou Aceita convite)
        // Passamos os dados do form, mas se tiver convite, eles serão ignorados em favor do convite
        await this.vincularUsuarioAoTime(user, companyName, role);

        return user;
    }

    async loginEmail(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    }

    async loginGoogle() {
        const provider = new GoogleAuthProvider();
        return signInWithPopup(auth, provider);
    }

    logout() {
        return signOut(auth);
    }
}