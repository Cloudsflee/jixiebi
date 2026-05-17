function robot_slider_control_level()

% ===== 1. Load URDF =====
robot = importrobot('SuArmT.urdf');
robot.DataFormat = 'struct';

config = homeConfiguration(robot);
initialConfig = config;

% ===== 2. Create figure =====
fig = figure('Name','Robot Control Level','NumberTitle','off');
ax = axes('Parent', fig);

show(robot, config, 'Parent', ax, 'Frames','on');
view(135,20);
axis equal
axis on
grid on
hold on

n = length(config);
jointMins = [-1.3; -0.5; -0.3; -3.14; -0.85; -0.85; -0.85];
jointMaxs = [2; 0; 1; 3.14; 0.5; 0.5; 0.5];
labelWidth = 60;
sliderX = 80;
sliderW = 300;
rowH = 40;
baseY = 70;
hiddenJoints = [4 6 7];

% ===== 3. Create sliders =====
sliders = gobjects(n,1);
valueTexts = gobjects(n,1);
jointLabels = gobjects(n,1);

for i = 1:n
    y = baseY + rowH * (i - 1);
    jointLabel = ['J' num2str(i)];
    if i == 5
        jointLabel = 'J5 (夹爪机构)';
    end

    isVisible = 'on';
    if ismember(i, hiddenJoints)
        isVisible = 'off';
    end

    jointLabels(i) = uicontrol('Style','text', ...
        'Position',[15 y labelWidth 20], ...
        'String',jointLabel, ...
        'Visible', isVisible);

    sliders(i) = uicontrol('Style', 'slider', ...
        'Min', jointMins(i), 'Max', jointMaxs(i), ...
        'Value', config(i).JointPosition, ...
        'Position', [sliderX y sliderW 20], ...
        'Callback', @(src, event) updateRobot(i), ...
        'Visible', isVisible);

    valueTexts(i) = uicontrol('Style','text', ...
        'Position',[sliderX + sliderW + 10 y 100 20], ...
        'String', sprintf('%.3f rad', config(i).JointPosition), ...
        'Visible', isVisible);
end

uicontrol('Style','text', ...
    'Position',[15 20 70 20], ...
    'String','J4 offset');

offsetSlider = uicontrol('Style', 'slider', ...
    'Min', jointMins(4), 'Max', jointMaxs(4), ...
    'Value', initialConfig(4).JointPosition, ...
    'Position', [85 20 180 20], ...
    'Callback', @(src, event) updateRobot([]));

offsetText = uicontrol('Style','text', ...
    'Position',[275 20 100 20], ...
    'String', sprintf('%.3f rad', initialConfig(4).JointPosition));

uicontrol('Style', 'pushbutton', ...
    'String', 'Reset', ...
    'Position', [390 20 80 25], ...
    'Callback', @(src, event) resetRobot());

% ===== 4. Update robot pose =====
function updateRobot(changedJoint)
    if isequal(changedJoint, 6) || isequal(changedJoint, 7)
        sliders(5).Value = sliders(changedJoint).Value;
    end

    sliders(6).Value = sliders(5).Value;
    sliders(7).Value = sliders(5).Value;

    for k = 1:n
        config(k).JointPosition = sliders(k).Value;
    end

    q2 = sliders(2).Value;
    q3 = sliders(3).Value;
    q4Offset = offsetSlider.Value;
    q4 = q4Offset - q2 - q3;
    q4 = min(max(q4, jointMins(4)), jointMaxs(4));

    config(4).JointPosition = q4;
    sliders(4).Value = q4;

    refreshValueTexts();
    offsetText.String = sprintf('%.3f rad', offsetSlider.Value);

    show(robot, config, 'Parent', ax, ...
        'PreservePlot', false, ...
        'Frames','on');

    drawnow;
end

function refreshValueTexts()
    for k = 1:n
        valueTexts(k).String = sprintf('%.3f rad', sliders(k).Value);
    end
end

function resetRobot()
    config = initialConfig;
    for k = 1:n
        sliders(k).Value = initialConfig(k).JointPosition;
    end
    offsetSlider.Value = initialConfig(4).JointPosition;

    sliders(6).Value = sliders(5).Value;
    sliders(7).Value = sliders(5).Value;
    q4 = offsetSlider.Value - sliders(2).Value - sliders(3).Value;
    sliders(4).Value = min(max(q4, jointMins(4)), jointMaxs(4));
    config(4).JointPosition = sliders(4).Value;
    config(5).JointPosition = sliders(5).Value;
    config(6).JointPosition = sliders(6).Value;
    config(7).JointPosition = sliders(7).Value;

    refreshValueTexts();
    offsetText.String = sprintf('%.3f rad', offsetSlider.Value);

    show(robot, config, 'Parent', ax, ...
        'PreservePlot', false, ...
        'Frames','on');

    drawnow;
end

end
