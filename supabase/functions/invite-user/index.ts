import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteUserRequest {
  email: string;
  fullName: string;
  role: string;
  orgId: string;
  password?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Invite user function called");

    // Validate authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("No authorization header");
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user's token to verify permissions
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client for user creation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated using getUser
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError || !userData?.user) {
      console.error("Invalid token:", userError);
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    console.log("Authenticated user:", userId);

    // Parse request body
    const { email, fullName, role, orgId, password }: InviteUserRequest = await req.json();
    console.log("Invite request:", { email, fullName, role, orgId });

    // Validate required fields
    if (!email || !fullName || !role || !orgId) {
      return new Response(
        JSON.stringify({ error: "Todos los campos son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has permission to manage users in this org
    const { data: canManage, error: permError } = await supabaseAdmin.rpc("can_manage_users", {
      user_uuid: userId,
      target_org_id: orgId,
    });

    if (permError || !canManage) {
      console.error("Permission denied:", permError);
      return new Response(
        JSON.stringify({ error: "No tienes permisos para invitar usuarios" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get organization details
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("name, slug")
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      console.error("Organization not found:", orgError);
      return new Response(
        JSON.stringify({ error: "Organización no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let newUserId: string;
    const passwordValue = typeof password === "string" ? password.trim() : "";
    const hasPassword = passwordValue.length > 0;

    if (existingUser) {
      // User exists, check if already member of this org
      const { data: existingMembership } = await supabaseAdmin
        .from("organization_memberships")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("org_id", orgId)
        .single();

      if (existingMembership) {
        return new Response(
          JSON.stringify({ error: "El usuario ya es miembro de esta organización" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      newUserId = existingUser.id;
      console.log("User already exists, adding to org:", newUserId);
    } else {
      if (!hasPassword) {
        return new Response(
          JSON.stringify({ error: "Se requiere una contraseña para crear el usuario" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: passwordValue,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !newUser.user) {
        console.error("Error creating user:", createError);
        return new Response(
          JSON.stringify({ error: "Error al crear el usuario: " + createError?.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      newUserId = newUser.user.id;
      console.log("User created:", newUserId);
    }

    // Create organization membership
    const { error: membershipError } = await supabaseAdmin
      .from("organization_memberships")
      .insert({
        user_id: newUserId,
        org_id: orgId,
        role: role,
        invited_by: userId,
      });

    if (membershipError) {
      console.error("Error creating membership:", membershipError);
      return new Response(
        JSON.stringify({ error: "Error al crear la membresía: " + membershipError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate password reset link for new users
    let resetLink = "";
    if (!existingUser && !hasPassword) {
      const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: email,
      });

      if (resetError) {
        console.error("Error generating reset link:", resetError);
      } else {
        resetLink = resetData.properties?.action_link || "";
      }
    }

    // Send invitation email
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    
    const roleLabels: Record<string, string> = {
      org_admin: "Administrador",
      inventory_manager: "Gestor de Inventario",
      import_operator: "Operador de Importaciones",
      viewer: "Visor",
      security_admin: "Administrador de Seguridad",
    };

    const isExistingUser = Boolean(existingUser);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h1 style="color: #18181b; margin-bottom: 24px; font-size: 24px;">¡Bienvenido a ${org.name}!</h1>
          
          <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
            Hola <strong>${fullName}</strong>,
          </p>
          
          <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
            Has sido invitado a unirte a <strong>${org.name}</strong> con el rol de <strong>${roleLabels[role] || role}</strong>.
          </p>
          
          ${resetLink ? `
          <div style="margin: 32px 0;">
            <a href="${resetLink}" style="background-color: #18181b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">
              Configurar mi contraseña
            </a>
          </div>
          
          <p style="color: #71717a; font-size: 14px; line-height: 1.6;">
            Si el botón no funciona, copia y pega este enlace en tu navegador:
            <br>
            <a href="${resetLink}" style="color: #2563eb; word-break: break-all;">${resetLink}</a>
          </p>
          ` : isExistingUser ? `
          <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
            Ya tienes una cuenta registrada. Puedes iniciar sesión con tu contraseña actual para acceder a la organización.
          </p>
          ` : `
          <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
            Tu administrador te asignó una contraseña temporal. Usa esa contraseña para iniciar sesión y luego cambia tu clave en tu perfil.
          </p>
          `}
          
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
          
          <p style="color: #a1a1aa; font-size: 12px;">
            Este correo fue enviado porque alguien te invitó a ${org.name}. Si no esperabas esta invitación, puedes ignorar este mensaje.
          </p>
        </div>
      </body>
      </html>
    `;

    const { error: emailError } = await resend.emails.send({
      from: "ELINEAS <onboarding@resend.dev>",
      to: [email],
      subject: `Invitación a ${org.name}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Error sending email:", emailError);
      // Don't fail the request, user was created successfully
    } else {
      console.log("Invitation email sent successfully");
    }

    // Log the audit event
    await supabaseAdmin.from("audit_logs").insert({
      action: "user_invited",
      entity_type: "user",
      entity_id: newUserId,
      org_id: orgId,
      user_id: userId,
      after_data: { email, fullName, role },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: newUserId,
        message: existingUser 
          ? "Usuario añadido a la organización" 
          : "Usuario creado e invitación enviada" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
