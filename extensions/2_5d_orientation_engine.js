// @name        2.5D Orientation Engine
// @developer   Vector Studio Team
// @description Absolute tracking, Geometric Contour Mapping, and 2.5D Orbital Parallax.
// @version     0.8.0

(function() {
    const EXT_ID = 'ext_orientation_engine';
    const iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21a9 9 0 0 0 9-9a9 9 0 0 0-9-9a9 9 0 0 0-9 9a9 9 0 0 0 9 9z"/><path d="M12 3a9 9 0 0 0 0 18a9 9 0 0 0 0-18z"/><path d="M12 21c-2.5 0-4.5-4-4.5-9s2-9 4.5-9s4.5 4 4.5 9s-2 9-4.5 9z"/></svg>`;

    let lastKnownBodyOrient = 0; // State cache to sync Body data across Siblings (Head/Arms/Legs)
    let dragState = { active: false, accumulatedDx: 0, startBodyAngle: 0, startHeadAngle: 0 };

    // --- GEOMETRIC CONTOUR MAPPING MATH ---
    // Decodes the exact mathematical boundary of any shape based on our Soft-Geometry primitives
    const getHeadGeometry = (props) => {
        const baseW = props?.width || 140;
        const baseH = props?.height || 160;
        const shape = props?.shape || 'rounded';
        
        if (shape === 'square') return { w: baseW, h: baseH, r: 15, cy: 0 };
        if (shape === 'wide') return { w: baseW + 40, h: baseH - 30, r: 45, cy: 15 };
        if (shape === 'tall') return { w: baseW - 20, h: baseH + 30, r: 45, cy: -18 };
        return { w: baseW, h: baseH, r: 45, cy: 0 }; // Default rounded
    };

    // O(1) query to find the exact X-coordinate edge at any specific Y-coordinate.
    const getContourX = (localY, geom) => {
        const shiftedY = localY - geom.cy;
        const halfW = geom.w / 2;
        const halfH = geom.h / 2;
        const absY = Math.abs(shiftedY);
        
        if (absY <= halfH - geom.r) return halfW; // It's on the straight vertical edge
        const dy = absY - (halfH - geom.r);
        if (dy > geom.r) return halfW - geom.r; // Failsafe clamp
        return (halfW - geom.r) + Math.sqrt(geom.r * geom.r - dy * dy); // Pythagorean curved edge
    };

    // --- TIMELINE API EXPOSURE ---
    window.StudioOrientation = {
        setOrientation: (nodeId, angle) => {
            const scene = window.StudioAPI.getProject();
            const search = (node) => {
                if (node.id === nodeId) { node.orientation = angle; return true; }
                if (node.children) { for (let c of node.children) if (search(c)) return true; }
                return false;
            };
            if (search(scene)) window.StudioAPI.updateScene(scene);
        }
    };

    const OrientationExtension = {
        tools: [
            { id: 'orient', icon: iconSvg, tooltip: 'Orient 2.5D (O)' }
        ],

        // Hook 1: Pre-Process Node 
        processNode: function(node, renderCtx) {
            // Z-Sorting intercept (Before Native Sort)
            if (node.type === 'body') {
                lastKnownBodyOrient = node.orientation || 0;
                if (node.children) {
                    node.children.forEach(c => {
                        // Arm Layering
                        if (c.id === 'arm_left') {
                            c.props = c.props || {};
                            c.props.layer = lastKnownBodyOrient > 0 ? 1 : -1;
                        }
                        if (c.id === 'arm_right') {
                            c.props = c.props || {};
                            c.props.layer = lastKnownBodyOrient < 0 ? 1 : -1;
                        }
                        // Leg Layering
                        if (c.id === 'leg_left') {
                            c.props = c.props || {};
                            c.props.layer = lastKnownBodyOrient > 0 ? -1 : -2;
                        }
                        if (c.id === 'leg_right') {
                            c.props = c.props || {};
                            c.props.layer = lastKnownBodyOrient < 0 ? -1 : -2;
                        }
                    });
                }
            }

            // The 90-Degree IK Tether for the Head
            if (node.type === 'head') {
                let headOrient = renderCtx.headOrientation || 0;
                headOrient = Math.max(lastKnownBodyOrient - 90, Math.min(lastKnownBodyOrient + 90, headOrient));
                renderCtx.headOrientation = headOrient; 
            }
        },

        // Hook 2: Pre-Render Interceptor
        preRenderNode: function(ctx, node, renderCtx, helpers) {
            const headOrient = renderCtx.headOrientation || 0;
            const bodyOrient = lastKnownBodyOrient;

            // ==========================================
            // HEAD & FACE PARALLAX
            // ==========================================
            if (node.type === 'face_group') {
                const turnFactor = Math.sin(headOrient * Math.PI / 180);
                const geom = getHeadGeometry(renderCtx.headProps);
                
                if (geom.r === 15) helpers.buildRoundedRectPath(ctx, -geom.w/2, -geom.h/2, geom.w, geom.h, geom.r); // Square
                else if (geom.cy === 15) helpers.buildRoundedRectPath(ctx, -geom.w/2, -geom.h/2 + 30, geom.w, geom.h, geom.r); // Wide
                else if (geom.cy === -18) helpers.buildRoundedRectPath(ctx, -geom.w/2, -geom.h/2 - 18, geom.w, geom.h, geom.r); // Tall
                else helpers.buildRoundedRectPath(ctx, -geom.w/2, -geom.h/2, geom.w, geom.h, geom.r); // Rounded
                
                ctx.clip(); 
                
                // Max slide is exactly half the true geometry width
                const maxFaceSlide = geom.w / 2;
                ctx.translate(turnFactor * maxFaceSlide, 0);
                return false; 
            }

            if (node.type === 'hair_back') {
                ctx.translate(-Math.sin(headOrient * Math.PI / 180) * 20, 0);
                return false;
            }

            if (node.type === 'head') {
                const { color='#FFB899' } = node.props || {};
                const geom = getHeadGeometry(node.props);
                const turnRatio = headOrient / 90;
                
                // Exact Ear placement via Contour Mapping at Y: -15
                const earEdgeX = getContourX(-15, geom);
                
                if (turnRatio > -0.5) { 
                    const lEarX = (-earEdgeX - 15) + (turnRatio > 0 ? turnRatio * (earEdgeX + 15) : 0);
                    helpers.drawPill(ctx, lEarX, -15, 25, 35, color);
                }
                if (turnRatio < 0.5) { 
                    const rEarX = (earEdgeX - 10) + (turnRatio < 0 ? turnRatio * (earEdgeX + 15) : 0);
                    helpers.drawPill(ctx, rEarX, -15, 25, 35, color);
                }

                if (geom.r === 15) helpers.drawRoundedRect(ctx, -geom.w/2, -geom.h/2, geom.w, geom.h, geom.r, color);
                else if (geom.cy === 15) helpers.drawRoundedRect(ctx, -geom.w/2, -geom.h/2 + 30, geom.w, geom.h, geom.r, color);
                else if (geom.cy === -18) helpers.drawRoundedRect(ctx, -geom.w/2, -geom.h/2 - 18, geom.w, geom.h, geom.r, color);
                else helpers.drawRoundedRect(ctx, -geom.w/2, -geom.h/2, geom.w, geom.h, geom.r, color);

                return true; 
            }

            if (node.type === 'eyes') {
                const { eyeColor='#FFFFFF', pupilColor='#333333', style='huge_oval' } = node.props || {};
                const lx = helpers.anim.currentLookX; const ly = helpers.anim.currentLookY;
                const pShift = Math.sin(headOrient * Math.PI / 180) * 12; 
                ctx.scale(1, Math.max(helpers.anim.blinkFactor, 0.1));

                if (style === 'happy_squint') {
                    ctx.beginPath(); ctx.arc(-25, 0, 12, Math.PI, 0);
                    ctx.strokeStyle = pupilColor; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
                    ctx.beginPath(); ctx.arc(25, 0, 12, Math.PI, 0); ctx.stroke();
                } else if (style === 'dot') {
                    ctx.beginPath(); ctx.arc(-25 + lx/2 + pShift, 8 + ly/2, 8, 0, Math.PI*2);
                    ctx.fillStyle = pupilColor; ctx.fill();
                    ctx.beginPath(); ctx.arc(25 + lx/2 + pShift, 8 + ly/2, 8, 0, Math.PI*2); ctx.fill();
                } else if (style === 'sleepy') {
                    helpers.drawPill(ctx, -45, -20, 40, 25, eyeColor);
                    helpers.drawPill(ctx, -35 + pShift, -15 + ly/3, 15, 15, pupilColor);
                    helpers.drawPill(ctx, 5, -20, 40, 25, eyeColor);
                    helpers.drawPill(ctx, 15 + pShift, -15 + ly/3, 15, 15, pupilColor);
                    helpers.drawRoundedRect(ctx, -45, -25, 40, 15, 5, '#D5BDAF'); 
                    helpers.drawRoundedRect(ctx, 5, -25, 40, 15, 5, '#D5BDAF');
                } else {
                    helpers.drawPill(ctx, -45, -25, 40, 50, eyeColor);
                    helpers.drawPill(ctx, -35 + lx + pShift, -10 + ly, 15, 20, pupilColor);
                    helpers.drawPill(ctx, 5, -25, 40, 50, eyeColor);
                    helpers.drawPill(ctx, 15 + lx + pShift, -10 + ly, 15, 20, pupilColor);
                }
                return true; 
            }

            if (node.type === 'nose' && Math.abs(headOrient) >= 75) return true;

            // ==========================================
            // BODY, ARM, & LEG ORBITAL ENGINE
            // ==========================================
            
            if (node.type === 'arm') {
                const absTurn = Math.abs(bodyOrient / 90);
                const isLeft = node.id === 'arm_left';
                const isLeading = isLeft ? bodyOrient > 0 : bodyOrient < 0;

                ctx.translate(-node.x * absTurn, 0);
                const scaleMod = isLeading ? (1.0 + (absTurn * 0.05)) : (1.0 - (absTurn * 0.05));
                ctx.scale(scaleMod, scaleMod);

                helpers.drawPill(ctx, -15, -15, 30, 30, node.props?.color || '#FFB899');
                if (!isLeading && absTurn > 0.1) {
                    helpers.drawPill(ctx, -15, -15, 30, 30, `rgba(0,0,0,${absTurn * 0.15})`);
                }
                return true; 
            }

            if (node.type === 'leg') {
                const absTurn = Math.abs(bodyOrient / 90);
                const isLeft = node.id === 'leg_left';
                const isLeading = isLeft ? bodyOrient > 0 : bodyOrient < 0;
                
                if (!isLeading && Math.abs(bodyOrient) >= 80) return true; 

                ctx.translate(-node.x * absTurn, 0);
                const scaleMod = isLeading ? (1.0 + (absTurn * 0.05)) : (1.0 - (absTurn * 0.05));
                ctx.scale(scaleMod, scaleMod);
                
                const toeDir = bodyOrient > 0 ? 1 : -1;
                
                const drawShoe = (fillBase, fillSole) => {
                    const ankleShift = absTurn * 5 * toeDir;
                    const soleExt = absTurn * 15 * toeDir;
                    helpers.drawPill(ctx, -20 + ankleShift, -10, 40 + (absTurn * 5), 25, fillBase);
                    const newX = -20 + (toeDir === -1 ? soleExt : 0); 
                    const newW = 40 + Math.abs(soleExt);
                    helpers.drawRoundedRect(ctx, newX, 5, newW, 10, 5, fillSole);
                };

                drawShoe('#1E293B', '#0F172A');
                if (!isLeading && absTurn > 0.1) {
                    const tint = `rgba(0,0,0,${absTurn * 0.15})`;
                    drawShoe(tint, tint);
                }
                return true;
            }

            if (node.type === 'body') {
                const { color='#FFB899', clothingColor='#4ADE80', clothingStyle='t_shirt', bodyType='standard', tieColor='#E11D48', jewelry='none', jewelryColor='#FBBF24' } = node.props || {};
                
                const absAngle = Math.abs(bodyOrient);
                let view = 'front';
                if (absAngle > 25 && absAngle <= 65) view = 'threeQuarter';
                else if (absAngle > 65) view = 'side';

                helpers.drawRoundedRect(ctx, -15, -30, 30, 40, 10, color); 

                ctx.save();
                if (bodyOrient < 0) ctx.scale(-1, 1); 

                const turnFactor = Math.sin(absAngle * Math.PI / 180);
                const cylinderScale = Math.max(0.55, Math.cos(absAngle * Math.PI / 180));

                ctx.scale(cylinderScale, 1); 

                const buildBodyPath = () => {
                    ctx.beginPath();
                    if (bodyType === 'ectomorph') {
                        ctx.moveTo(-35, 0); ctx.quadraticCurveTo(0, -15, 35, 0); ctx.lineTo(40, 110); ctx.lineTo(-40, 110);
                    } else if (bodyType === 'endomorph') {
                        ctx.moveTo(-50, 0); ctx.quadraticCurveTo(0, -20, 50, 0);
                        ctx.quadraticCurveTo(75, 60, 60, 110); ctx.lineTo(-60, 110);
                        ctx.quadraticCurveTo(-75, 60, -50, 0);
                    } else if (bodyType === 'muscular') {
                        ctx.moveTo(-60, 0); ctx.quadraticCurveTo(0, -20, 60, 0);
                        ctx.quadraticCurveTo(55, 30, 40, 100); ctx.lineTo(-40, 100);
                        ctx.quadraticCurveTo(-55, 30, -60, 0);
                    } else if (bodyType === 'hourglass') {
                        ctx.moveTo(-45, 0); ctx.quadraticCurveTo(0, -20, 45, 0);
                        ctx.bezierCurveTo(45, 30, 25, 50, 50, 110); ctx.lineTo(-50, 110);
                        ctx.bezierCurveTo(-25, 50, -45, 30, -45, 0);
                    } else {
                        ctx.moveTo(-45, 0); ctx.quadraticCurveTo(0, -20, 45, 0); ctx.lineTo(55, 100); ctx.lineTo(-55, 100);
                    }
                    ctx.closePath();
                };

                buildBodyPath();
                ctx.fillStyle = clothingColor; 
                ctx.fill();

                ctx.save();

                const customAsset = window.StudioAssets.clothes && window.StudioAssets.clothes[clothingStyle];
                let clothScaleX = 1;
                if (bodyType === 'ectomorph') clothScaleX = 0.75;
                if (bodyType === 'endomorph') clothScaleX = 1.35;
                if (bodyType === 'muscular') clothScaleX = 1.15;
                if (bodyType === 'hourglass') clothScaleX = 0.95;
                ctx.scale(clothScaleX, 1);

                if (customAsset) {
                    let renderStr = customAsset.renderFront || customAsset.render; 
                    let isNativeMultiView = false;
                    
                    if (view === 'side' && customAsset.renderSide) {
                        renderStr = customAsset.renderSide;
                        isNativeMultiView = true;
                    } else if (view === 'threeQuarter' && customAsset.renderThreeQuarter) {
                        renderStr = customAsset.renderThreeQuarter;
                        isNativeMultiView = true;
                    }

                    if (!isNativeMultiView) {
                        buildBodyPath();
                        ctx.clip();
                        ctx.translate((turnFactor * 30) / cylinderScale, 0);
                    }

                    try {
                        const renderFn = new Function('ctx', 'props', 'helpers', renderStr);
                        renderFn(ctx, node.props, helpers);
                    } catch(e) {}
                } else {
                    buildBodyPath();
                    ctx.clip();
                    const slideX = (turnFactor * 30) / cylinderScale; 
                    ctx.translate(slideX, 0);

                    if (clothingStyle === 'tank_top') {
                        ctx.beginPath(); ctx.moveTo(-25, -30); ctx.bezierCurveTo(-20, 35, 20, 35, 25, -30); ctx.lineTo(-25, -30); ctx.fillStyle = color; ctx.fill();
                        ctx.beginPath(); ctx.moveTo(-100, -30); ctx.lineTo(-22, -10); ctx.lineTo(-30, 120); ctx.lineTo(-100, 120); ctx.fillStyle = color; ctx.fill();
                        ctx.beginPath(); ctx.moveTo(100, -30); ctx.lineTo(22, -10); ctx.lineTo(30, 120); ctx.lineTo(100, 120); ctx.fillStyle = color; ctx.fill();
                    } else if (clothingStyle === 'v_neck') {
                        ctx.beginPath(); ctx.moveTo(-25, -10); ctx.lineTo(0, 30); ctx.lineTo(25, -10); ctx.fillStyle = color; ctx.fill();
                    } else if (clothingStyle === 'crop_top') {
                        ctx.save();
                        ctx.translate(-slideX, 0); 
                        ctx.beginPath(); ctx.rect(-100, 60, 200, 60); ctx.fillStyle = color; ctx.fill();
                        ctx.restore();
                        ctx.beginPath(); ctx.arc(0, 85, 3, 0, Math.PI*2); ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fill();
                    } else if (clothingStyle === 'suit') {
                        ctx.beginPath(); ctx.moveTo(-35, -20); ctx.lineTo(0, 60); ctx.lineTo(35, -20); ctx.fillStyle = '#FFFFFF'; ctx.fill();
                        ctx.beginPath(); helpers.drawRoundedRect(ctx, -6, -10, 12, 14, 3, tieColor);
                        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(7, 65); ctx.lineTo(0, 75); ctx.lineTo(-7, 65); ctx.fillStyle = tieColor; ctx.fill();
                        ctx.fillStyle = clothingColor;
                        ctx.beginPath(); ctx.moveTo(-100, -30); ctx.lineTo(-25, -20); ctx.lineTo(0, 65); ctx.lineTo(-100, 120); ctx.closePath(); ctx.fill();
                        ctx.beginPath(); ctx.moveTo(100, -30); ctx.lineTo(25, -20); ctx.lineTo(0, 65); ctx.lineTo(100, 120); ctx.closePath(); ctx.fill();
                        ctx.fillStyle = 'rgba(0,0,0,0.15)';
                        ctx.beginPath(); ctx.moveTo(-25, -20); ctx.lineTo(-12, 10); ctx.lineTo(-20, 15); ctx.lineTo(-3, 60); ctx.lineTo(0, 65); ctx.closePath(); ctx.fill();
                        ctx.beginPath(); ctx.moveTo(25, -20); ctx.lineTo(12, 10); ctx.lineTo(20, 15); ctx.lineTo(3, 60); ctx.lineTo(0, 65); ctx.closePath(); ctx.fill();
                        ctx.beginPath(); ctx.moveTo(0, 65); ctx.lineTo(0, 120); ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2; ctx.stroke();
                        ctx.beginPath(); ctx.arc(0, 65, 4, 0, Math.PI*2); ctx.fillStyle = '#1E293B'; ctx.fill();
                    }
                }

                if (bodyType === 'hourglass') {
                    ctx.save();
                    ctx.translate(-((turnFactor * 30) / cylinderScale), 0); 
                    ctx.beginPath();
                    ctx.arc(-18, 30, 18, 0, Math.PI, false);
                    ctx.arc(18, 30, 18, 0, Math.PI, false);
                    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 3; ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();

                // 3. Jewelry Parallax 
                ctx.translate((turnFactor * 35) / cylinderScale, 0);
                if (jewelry === 'gold_chain' || jewelry === 'silver_chain') {
                    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI, false);
                    ctx.strokeStyle = jewelry === 'gold_chain' ? '#FBBF24' : '#94A3B8'; ctx.lineWidth = 3; ctx.stroke();
                    ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI, false);
                    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
                } else if (jewelry === 'pearl_necklace') {
                    ctx.beginPath();
                    for (let i = 0; i <= 10; i++) {
                        let angle = (Math.PI / 10) * i;
                        let px = Math.cos(angle) * 25;
                        let py = Math.sin(angle) * 20 - 5;
                        ctx.moveTo(px + 4, py); ctx.arc(px, py, 4, 0, Math.PI*2);
                    }
                    ctx.fillStyle = jewelryColor; ctx.fill();
                } else if (jewelry === 'gem_pendant') {
                    ctx.beginPath(); ctx.arc(0, -5, 25, 0, Math.PI, false);
                    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, 28); ctx.lineTo(8, 20); ctx.lineTo(0, 12); ctx.lineTo(-8, 20); ctx.closePath();
                    ctx.fillStyle = jewelryColor; ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.stroke();
                }

                ctx.restore(); 
                return true; 
            }

            if (node.type === 'hair' || node.type === 'hair_front' || node.type === 'hair_back') {
                const { color='#334155', style='afro_cloud' } = node.props || {};
                
                const absAngle = Math.abs(headOrient);
                let view = 'front';
                if (absAngle > 25 && absAngle <= 65) view = 'threeQuarter';
                else if (absAngle > 65) view = 'side';

                ctx.save();
                if (headOrient < 0) ctx.scale(-1, 1); 

                // Dynamic geometry scale
                const geom = getHeadGeometry(renderCtx.headProps);
                ctx.scale(geom.w / 140, 1);

                ctx.fillStyle = color;

                const customAsset = window.StudioAssets.hair && window.StudioAssets.hair[style];
                if (customAsset) {
                    let renderStr = customAsset.renderFront || customAsset.render; 
                    if (view === 'side' && customAsset.renderSide) renderStr = customAsset.renderSide;
                    else if (view === 'threeQuarter' && customAsset.renderThreeQuarter) renderStr = customAsset.renderThreeQuarter;

                    try {
                        const renderFn = new Function('ctx', 'props', 'helpers', renderStr);
                        renderFn(ctx, node.props, helpers);
                    } catch(e) {}
                } else {
                    if (style === 'none') { }
                    else if (style === 'bun') {
                        helpers.drawRoundedRect(ctx, -70, -30, 140, 60, 25, color);
                        ctx.beginPath(); ctx.arc(0, -50, 35, 0, Math.PI*2); ctx.fill();
                    } else if (style === 'spiky') {
                        ctx.beginPath(); ctx.moveTo(-75, -10);
                        ctx.lineTo(-60, -60); ctx.lineTo(-30, -30);
                        ctx.lineTo(0, -75); ctx.lineTo(30, -30);
                        ctx.lineTo(60, -60); ctx.lineTo(75, -10);
                        ctx.closePath(); ctx.fill();
                    } else if (style === 'afro_cloud') {
                        ctx.beginPath();
                        const circles = [
                            [0, -20, 60], [-50, 10, 40], [50, 10, 40],
                            [-30, -50, 50], [30, -50, 50], [0, 0, 50]
                        ];
                        circles.forEach(([cx, cy, r]) => {
                            if (node.type === 'hair_back' && cx === 0 && cy === 0) return; 
                            ctx.moveTo(cx + r, cy);
                            ctx.arc(cx, cy, r, 0, Math.PI*2);
                        });
                        ctx.fill();
                    } else {
                        helpers.drawRoundedRect(ctx, -70, -30, 140, 60, 20, color);
                    }
                }
                ctx.restore();
                return true;
            }

            return false;
        },

        // Hook 3: Post-Render Interceptor
        postRenderNode: function(ctx, node, renderCtx, helpers) {
            // Draw the precise profile bump via Contour Mapping!
            if (node.type === 'head' && Math.abs(renderCtx.headOrientation || 0) >= 75) {
                const geom = getHeadGeometry(node.props);
                const edgeX = getContourX(20, geom); // Nose sits exactly at Y: 20
                
                const { color='#FFB899' } = node.props || {};
                const isRight = (renderCtx.headOrientation || 0) > 0;
                
                ctx.beginPath();
                ctx.arc(isRight ? edgeX : -edgeX, 20, 12, isRight ? -Math.PI/2 : Math.PI/2, isRight ? Math.PI/2 : -Math.PI/2, false);
                ctx.fillStyle = helpers.tintSkinToNose ? helpers.tintSkinToNose(color) : color; 
                ctx.fill();
            }
        },

        // Hook 4: Custom Gizmo Rendering
        drawGizmos: function(ctx, node, selectedNodeId, activeTool, activeGizmo, camera) {
            if (node.id === selectedNodeId && activeTool === 'orient' && (node.type === 'head' || node.type === 'body')) {
                ctx.save();
                ctx.scale(1/camera.zoom, 1/camera.zoom);
                ctx.strokeStyle = activeGizmo === 'orient' ? '#818CF8' : '#3B82F6';
                ctx.lineWidth = 3;
                
                ctx.beginPath(); ctx.ellipse(0, 80, 60, 15, 0, 0, Math.PI); ctx.stroke();
                
                ctx.fillStyle = ctx.strokeStyle;
                ctx.beginPath(); ctx.moveTo(55, 75); ctx.lineTo(65, 80); ctx.lineTo(55, 85); ctx.fill();
                ctx.beginPath(); ctx.moveTo(-55, 75); ctx.lineTo(-65, 80); ctx.lineTo(-55, 85); ctx.fill();
                
                ctx.fillStyle = '#334155'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText(`${Math.round(node.orientation || 0)}°`, 0, 105);
                ctx.restore();
            }
        },

        // Hook 5: Hit Detection (STRICT ELLIPSE ISOLATION)
        onMouseDown: function(wp, selectedNodeId, activeTool, camera, projectData) {
            if (activeTool === 'orient') {
                let hit = null;
                const search = (n, accX, accY) => {
                    if (n.id === selectedNodeId && (n.type === 'head' || n.type === 'body')) {
                        // Project local world coordinates to isolated Gizmo Space
                        const localX = wp.x - (accX + n.x);
                        const localY = wp.y - (accY + n.y);
                        
                        // Reverse Camera Zoom applied in drawGizmos
                        const screenLocalX = localX * camera.zoom;
                        const screenLocalY = localY * camera.zoom;
                        
                        // Mathematical Ellipse Intersection (cx: 0, cy: 80, rx: 60, ry: 15)
                        const dx = screenLocalX;
                        const dy = screenLocalY - 80;
                        
                        // Strict bounds checking with generous 1.5 radius threshold for easy grabbing
                        if ((dx * dx) / 3600 + (dy * dy) / 225 <= 1.5) {
                            hit = 'orient';
                            
                            // Initialize Absolute Tracking Session Data
                            let startBodyAngle = 0;
                            let startHeadAngle = 0;
                            const getAngles = (node) => {
                                if (node.id === 'body') startBodyAngle = node.orientation || 0;
                                if (node.id === 'head') startHeadAngle = node.orientation || 0;
                                if (node.children) node.children.forEach(getAngles);
                            };
                            getAngles(projectData);
                            
                            dragState.active = true;
                            dragState.accumulatedDx = 0;
                            dragState.startBodyAngle = startBodyAngle;
                            dragState.startHeadAngle = startHeadAngle;
                        }
                        return true;
                    }
                    if (n.children) {
                        for (let c of n.children) if (search(c, accX + n.x, accY + n.y)) return true;
                    }
                    return false;
                };
                search(projectData, 0, 0);
                return hit;
            }
            return null;
        },

        // Hook 6: ABSOLUTE SESSION TRACKING (Fluid dragging)
        onDrag: function(dx, dy, selectedNodeId, activeTool, activeGizmo, camera) {
            if (activeTool === 'orient' && activeGizmo === 'orient' && dragState.active) {
                const scene = window.StudioAPI.getProject();
                
                // Track raw mouse movement infinitely
                dragState.accumulatedDx += dx;
                const absoluteTurn = dragState.accumulatedDx * 0.5; // Drag Sensitivity
                
                let headNode = null, bodyNode = null;
                const findNodes = (n) => {
                    if (n.id === 'head') headNode = n;
                    if (n.id === 'body') bodyNode = n;
                    if (n.children) n.children.forEach(findNodes);
                };
                findNodes(scene);

                if (selectedNodeId === 'body' && bodyNode && headNode) {
                    let targetBody = dragState.startBodyAngle + absoluteTurn;
                    let newBodyOrient = Math.max(-90, Math.min(90, targetBody));
                    let actualDelta = newBodyOrient - dragState.startBodyAngle;
                    
                    bodyNode.orientation = newBodyOrient;
                    headNode.orientation = Math.max(-90, Math.min(90, dragState.startHeadAngle + actualDelta));
                    
                    window.StudioAPI.updateScene(scene);
                    return true;
                }

                if (selectedNodeId === 'head' && headNode && bodyNode) {
                    let targetHead = dragState.startHeadAngle + absoluteTurn;
                    let bodyOrient = bodyNode.orientation || 0;
                    
                    let newHeadOrient = Math.max(bodyOrient - 90, Math.min(bodyOrient + 90, targetHead));
                    newHeadOrient = Math.max(-90, Math.min(90, newHeadOrient));
                    
                    headNode.orientation = newHeadOrient;
                    window.StudioAPI.updateScene(scene);
                    return true;
                }
            }
            return false;
        }
    };

    window.StudioExtensions.register(EXT_ID, OrientationExtension);
})();
